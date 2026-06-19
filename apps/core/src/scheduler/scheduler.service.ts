import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { HEALTH_THRESHOLDS, OpeningJob } from '@dispatch/shared';
import { buildLeadContext, renderTemplate } from '../common/template';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_OPENINGS, REDIS_CONNECTION } from '../redis/redis.tokens';

type ChipRow = {
  id: string;
  label: string;
  phone: string;
  status: string;
  rampDay: number;
  dailyCap: number;
  sentToday: number;
  healthScore: number;
  windowStart: number;
  windowEnd: number;
  restDays: unknown;
};

export interface TickResult {
  ranAt: string;
  runningDispatches: number;
  enqueued: number;
  perChip: Record<string, number>;
  finishedDispatches: string[];
}

/**
 * Motor de disparo. A cada tick, para cada Disparo RUNNING:
 *  - reveza entre os numeros SELECIONADOS que estao elegiveis (status, janela,
 *    dia de descanso, saude, capacidade livre e intervalo de jitter cumprido)
 *  - reivindica 1 lead PENDING do fluxo, sorteia uma abertura variada, renderiza
 *    as variaveis, calcula delay de digitacao e enfileira o envio no worker
 *  - atualiza sentToday, marca o lead OPENED, abre a Conversa e registra a Message
 * Respeita rampa/teto/janela/jitter por chip (anti-ban). 1 envio por chip por tick.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  private readonly rampCurve: number[];
  private readonly jitterMin: number;
  private readonly jitterMax: number;
  private readonly tickMs: number;
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(QUEUE_OPENINGS) private readonly openings: Queue<OpeningJob>,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {
    this.rampCurve = (config.get<string>('RAMP_CURVE') ?? '5,8,15,25,35,45,55')
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    this.jitterMin = config.get<number>('JITTER_MIN_MS', 45000);
    this.jitterMax = config.get<number>('JITTER_MAX_MS', 180000);
    this.tickMs = config.get<number>('SCHEDULER_TICK_MS', 15000);
    this.enabled = config.get<boolean>('SCHEDULER_ENABLED', true);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.warn('Scheduler DESLIGADO (SCHEDULER_ENABLED=false)');
      return;
    }
    this.timer = setInterval(() => void this.safeTick(), this.tickMs);
    this.logger.log(`Scheduler ligado (tick ${this.tickMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async safeTick(): Promise<void> {
    if (this.running) return; // sem ticks concorrentes
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`tick falhou: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Executa um ciclo. Exposto p/ disparo manual (testes/debug). */
  async tick(): Promise<TickResult> {
    await this.resetDailyIfNeeded();

    const result: TickResult = {
      ranAt: new Date().toISOString(),
      runningDispatches: 0,
      enqueued: 0,
      perChip: {},
      finishedDispatches: [],
    };

    const dispatches = await this.prisma.dispatch.findMany({
      where: { status: 'RUNNING' },
      include: {
        flow: { select: { id: true, variables: true } },
        chips: {
          select: {
            id: true,
            label: true,
            phone: true,
            status: true,
            rampDay: true,
            dailyCap: true,
            sentToday: true,
            healthScore: true,
            windowStart: true,
            windowEnd: true,
            restDays: true,
          },
        },
      },
    });
    result.runningDispatches = dispatches.length;

    for (const dispatch of dispatches) {
      const pending = await this.prisma.lead.count({
        where: { flowId: dispatch.flowId, status: 'PENDING', suppressed: false },
      });
      if (pending === 0) {
        await this.prisma.dispatch.update({
          where: { id: dispatch.id },
          data: { status: 'DONE' },
        });
        result.finishedDispatches.push(dispatch.id);
        continue;
      }

      const openings = await this.prisma.openingMessage.findMany({
        where: { flowId: dispatch.flowId, active: true },
      });
      if (openings.length === 0) continue;

      for (const chip of dispatch.chips as ChipRow[]) {
        if (!this.canSend(chip)) continue;
        if (!(await this.dueBySchedule(chip.id))) continue;

        const sent = await this.dispatchOne(
          dispatch.id,
          dispatch.flowId,
          dispatch.flow.variables,
          dispatch.allowLinkInOpening,
          chip,
          openings,
        );
        if (sent) {
          result.enqueued++;
          result.perChip[chip.label] = (result.perChip[chip.label] ?? 0) + 1;
          await this.armNextSend(chip.id);
        }
      }
    }

    return result;
  }

  /** Reivindica 1 lead, renderiza, enfileira e registra. Retorna true se enviou. */
  private async dispatchOne(
    dispatchId: string,
    flowId: string,
    flowVariables: unknown,
    allowLink: boolean,
    chip: ChipRow,
    openings: { template: string; weight: number }[],
  ): Promise<boolean> {
    const lead = await this.prisma.lead.findFirst({
      where: { flowId, status: 'PENDING', suppressed: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!lead) return false;

    // claim atomico: so segue se ESTE tick pegou o lead
    const claim = await this.prisma.lead.updateMany({
      where: { id: lead.id, status: 'PENDING' },
      data: { status: 'QUEUED' },
    });
    if (claim.count !== 1) return false;

    try {
      const opening = this.pickOpening(openings);
      const extras = allowLink ? { link: '' } : {}; // {link} real: Fase 7 (bridge)
      const ctx = buildLeadContext(lead, flowVariables, extras);
      const text = renderTemplate(opening.template, ctx);
      const typingDelayMs = this.typingDelay(text);

      await this.openings.add('opening', {
        leadId: lead.id,
        chipId: chip.id,
        to: lead.phone,
        text,
        typingDelayMs,
      });

      // conversa + mensagem de saida (mesmo chip respondera o lead)
      const conv = await this.prisma.conversation.upsert({
        where: { leadId: lead.id },
        update: {},
        create: { leadId: lead.id, flowId, state: 'WAITING_REPLY' },
      });
      await this.prisma.message.create({
        data: {
          conversationId: conv.id,
          chipId: chip.id,
          direction: 'OUT',
          type: 'TEXT',
          content: text,
        },
      });
      await this.prisma.whatsappNumber.update({
        where: { id: chip.id },
        data: { sentToday: { increment: 1 } },
      });
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'OPENED' },
      });
      return true;
    } catch (err) {
      // falhou ao montar/enfileirar: devolve o lead para PENDING
      await this.prisma.lead.updateMany({
        where: { id: lead.id, status: 'QUEUED' },
        data: { status: 'PENDING' },
      });
      this.logger.error(
        `dispatchOne chip=${chip.label}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  // ---------------- elegibilidade ----------------

  private canSend(chip: ChipRow): boolean {
    if (chip.status !== 'ACTIVE' && chip.status !== 'WARMING') return false;
    // < COOLDOWN: nem envia (o Health Monitor já deve ter posto em COOLDOWN).
    // banda COOLDOWN..SOFT: envia com teto reduzido pelo Health Monitor.
    if (chip.healthScore < HEALTH_THRESHOLDS.COOLDOWN) return false;
    if (chip.dailyCap - chip.sentToday <= 0) return false;
    if (!this.inWindow(chip)) return false;
    if (this.isRestDay(chip)) return false;
    return true;
  }

  private inWindow(chip: ChipRow): boolean {
    const hour = new Date().getHours();
    return hour >= chip.windowStart && hour < chip.windowEnd;
  }

  private isRestDay(chip: ChipRow): boolean {
    const days = Array.isArray(chip.restDays) ? (chip.restDays as number[]) : [];
    return days.includes(new Date().getDay());
  }

  /** Gate de jitter: so envia se passou o intervalo aleatorio do chip. */
  private async dueBySchedule(chipId: string): Promise<boolean> {
    const raw = await this.redis.get(`sched:nextSend:${chipId}`);
    return !raw || Number(raw) <= Date.now();
  }

  private async armNextSend(chipId: string): Promise<void> {
    const jitter =
      this.jitterMin +
      Math.floor(Math.random() * Math.max(this.jitterMax - this.jitterMin, 1));
    await this.redis.set(
      `sched:nextSend:${chipId}`,
      String(Date.now() + jitter),
      'EX',
      86400,
    );
  }

  // ---------------- helpers ----------------

  private pickOpening<T extends { weight: number }>(openings: T[]): T {
    const total = openings.reduce((s, o) => s + Math.max(o.weight, 1), 0);
    let r = Math.random() * total;
    for (const o of openings) {
      r -= Math.max(o.weight, 1);
      if (r <= 0) return o;
    }
    return openings[openings.length - 1];
  }

  /** Delay de digitacao proporcional ao tamanho + jitter (responder como humano). */
  private typingDelay(text: string): number {
    const base = Math.min(Math.max(text.length * 45, 1500), 9000);
    return base + 500 + Math.floor(Math.random() * 1500);
  }

  private dailyCapForRamp(rampDay: number): number {
    if (rampDay <= 0 || this.rampCurve.length === 0) return 0;
    return this.rampCurve[Math.min(rampDay - 1, this.rampCurve.length - 1)];
  }

  /** Reset diario: zera sentToday, avanca rampa, recalcula teto. Idempotente no dia. */
  private async resetDailyIfNeeded(): Promise<void> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const chips = await this.prisma.whatsappNumber.findMany({
      where: {
        status: { in: ['WARMING', 'ACTIVE', 'COOLDOWN'] },
        OR: [{ lastResetAt: null }, { lastResetAt: { lt: start } }],
      },
      select: { id: true, rampDay: true },
    });

    for (const c of chips) {
      const newRamp = c.rampDay + 1;
      await this.prisma.whatsappNumber.update({
        where: { id: c.id },
        data: {
          sentToday: 0,
          rampDay: newRamp,
          dailyCap: this.dailyCapForRamp(newRamp),
          lastResetAt: new Date(),
        },
      });
    }
    if (chips.length) {
      this.logger.log(`reset diario aplicado a ${chips.length} chip(s)`);
    }
  }
}
