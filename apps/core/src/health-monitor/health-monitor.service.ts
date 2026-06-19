import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChipStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  ControlCommand,
  HEALTH_SIGNAL_WEIGHTS,
  HEALTH_THRESHOLDS,
  HealthSignalKind,
  MAX_CONSEC_FAILS,
} from '@dispatch/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_CONTROL } from '../redis/redis.tokens';

const RECOVERY_PER_HOUR = 2; // cura passiva por hora sem sinal ruim
const COOLDOWN_RAMP_CAP = 5; // teto reduzido ao voltar de cooldown
const COOLDOWN_MINUTES = 60; // tempo em COOLDOWN antes de tentar religar

/**
 * Health Monitor + kill switch. A saúde é INFERIDA por sinais indiretos
 * (API não-oficial não dá evento limpo de "bloqueado"). Ação de saúde tem
 * PRIORIDADE sobre meta de envio. O CORE é dono do status; manda STOP/RETIRE
 * pro worker via fila CONTROL.
 */
@Injectable()
export class HealthMonitorService {
  private readonly logger = new Logger(HealthMonitorService.name);
  // serializa o processamento POR CHIP (evita race no read-modify-write do score)
  private readonly chain = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(QUEUE_CONTROL) private readonly control: Queue<ControlCommand>,
  ) {}

  /** Enfileira o sinal na cadeia daquele chip (1 por vez por chip). */
  ingestSignal(
    chipId: string,
    kind: HealthSignalKind,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    const prev = this.chain.get(chipId) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(() => this.process(chipId, kind, detail));
    this.chain.set(
      chipId,
      next.finally(() => {
        if (this.chain.get(chipId) === next) this.chain.delete(chipId);
      }),
    );
    return next;
  }

  private async process(
    chipId: string,
    kind: HealthSignalKind,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    const chip = await this.prisma.whatsappNumber.findUnique({
      where: { id: chipId },
      select: {
        id: true,
        status: true,
        healthScore: true,
        consecFails: true,
        dailyCap: true,
        lastSignalAt: true,
      },
    });
    if (!chip) return;
    // chip já aposentado: ignora (não ressuscita por sinal)
    if (chip.status === ChipStatus.RETIRED) return;

    const weight = HEALTH_SIGNAL_WEIGHTS[kind] ?? 0;

    await this.prisma.healthEvent.create({
      data: { chipId, kind, weight, detail: (detail ?? {}) as object },
    });

    // cura passiva pelo tempo sem sinal — só quando o sinal NÃO é ruim
    // (senão um chip martelado de leve "cicatriza" e escapa do RETIRE)
    const now = new Date();
    const hours = chip.lastSignalAt
      ? (now.getTime() - chip.lastSignalAt.getTime()) / 3_600_000
      : 0;
    const healed = weight < 0 ? 0 : Math.min(hours * RECOVERY_PER_HOUR, 100);
    const score = clamp(chip.healthScore + healed + weight, 0, 100);

    let consecFails = chip.consecFails;
    if (kind === 'SEND_FAIL') consecFails += 1;
    else if (kind === 'RECOVERED') consecFails = 0;

    await this.prisma.whatsappNumber.update({
      where: { id: chipId },
      data: { healthScore: score, consecFails, lastSignalAt: now },
    });

    await this.applyPolicy({
      id: chipId,
      status: chip.status,
      score,
      consecFails,
      dailyCap: chip.dailyCap,
    });
  }

  private async applyPolicy(c: {
    id: string;
    status: ChipStatus;
    score: number;
    consecFails: number;
    dailyCap: number;
  }): Promise<void> {
    if (c.score < HEALTH_THRESHOLDS.RETIRE || c.consecFails >= MAX_CONSEC_FAILS) {
      return this.retire(c.id, c.score, c.consecFails);
    }
    if (c.score < HEALTH_THRESHOLDS.COOLDOWN) {
      if (c.status !== ChipStatus.COOLDOWN) return this.cooldown(c.id, c.score);
      return;
    }
    if (c.score < HEALTH_THRESHOLDS.SOFT) {
      return this.reduceRamp(c.id, c.dailyCap, c.score);
    }
    // saudável de novo: se estava em COOLDOWN, volta em rampa reduzida
    if (c.status === ChipStatus.COOLDOWN) return this.recover(c.id, c.score);
  }

  private async retire(id: string, score: number, fails: number): Promise<void> {
    await this.prisma.whatsappNumber.update({
      where: { id },
      data: { status: ChipStatus.RETIRED },
    });
    await this.control.add('control', { type: 'RETIRE', chipId: id });
    this.logger.warn(`RETIRE chip=${id} (score=${score.toFixed(0)} fails=${fails})`);
  }

  private async cooldown(id: string, score: number): Promise<void> {
    await this.prisma.whatsappNumber.update({
      where: { id },
      data: { status: ChipStatus.COOLDOWN },
    });
    await this.control.add('control', { type: 'STOP', chipId: id });
    this.logger.warn(`COOLDOWN chip=${id} (score=${score.toFixed(0)})`);
  }

  private async reduceRamp(
    id: string,
    dailyCap: number,
    score: number,
  ): Promise<void> {
    const newCap = Math.max(1, Math.floor(dailyCap / 2));
    if (newCap >= dailyCap) return;
    await this.prisma.whatsappNumber.update({
      where: { id },
      data: { dailyCap: newCap },
    });
    this.logger.log(
      `SOFT chip=${id} (score=${score.toFixed(0)}) -> dailyCap ${dailyCap}->${newCap}`,
    );
  }

  private async recover(id: string, score: number): Promise<void> {
    await this.prisma.whatsappNumber.update({
      where: { id },
      data: { status: ChipStatus.WARMING, dailyCap: COOLDOWN_RAMP_CAP, consecFails: 0 },
    });
    await this.control.add('control', { type: 'START', chipId: id });
    this.logger.log(`RECOVER chip=${id} (score=${score.toFixed(0)}) -> WARMING`);
  }

  /**
   * Varredura periódica: COOLDOWN é temporário. Um chip parado não emite sinais,
   * então sem isso ele ficaria preso para sempre (deadlock). Após COOLDOWN_MINUTES
   * sem sinal ruim, recupera curando o score acima do limiar e religando a sessão.
   */
  async sweepCooldowns(): Promise<void> {
    const cutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60_000);
    const chips = await this.prisma.whatsappNumber.findMany({
      where: { status: ChipStatus.COOLDOWN, lastSignalAt: { lt: cutoff } },
      select: { id: true, healthScore: true },
    });
    for (const c of chips) {
      const score = clamp(c.healthScore + 25, HEALTH_THRESHOLDS.SOFT, 100);
      await this.prisma.whatsappNumber.update({
        where: { id: c.id },
        data: { healthScore: score, lastSignalAt: new Date() },
      });
      await this.recover(c.id, score);
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
