import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  chipPairKey,
  ControlCommand,
  PairState,
} from '@dispatch/shared';
import { normalizeE164 } from '../common/phone';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_CONTROL, REDIS_CONNECTION } from '../redis/redis.tokens';
import { BindProxyDto, CreateChipDto } from './dto/create-chip.dto';

/** DDI -> pais (minimo; o projeto e BR). */
function ddiCountry(phoneE164: string): string | null {
  if (phoneE164.startsWith('+55')) return 'BR';
  return null;
}

@Injectable()
export class ChipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(QUEUE_CONTROL) private readonly control: Queue<ControlCommand>,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  async create(dto: CreateChipDto) {
    const phone = normalizeE164(dto.phone);
    if (dto.proxyId) await this.assertRegionMatch(phone, dto.proxyId);

    return this.prisma.whatsappNumber.create({
      data: { label: dto.label, phone, proxyId: dto.proxyId ?? null },
    });
  }

  list() {
    return this.prisma.whatsappNumber.findMany({
      select: {
        id: true,
        label: true,
        phone: true,
        status: true,
        rampDay: true,
        dailyCap: true,
        healthScore: true,
        proxyId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const chip = await this.prisma.whatsappNumber.findUnique({
      where: { id },
      include: { proxy: true },
    });
    if (!chip) throw new NotFoundException('chip nao encontrado');
    return chip;
  }

  async bindProxy(id: string, dto: BindProxyDto) {
    const chip = await this.get(id);
    await this.assertRegionMatch(chip.phone, dto.proxyId);
    return this.prisma.whatsappNumber.update({
      where: { id },
      data: { proxyId: dto.proxyId },
    });
  }

  /** Enfileira o pareamento (Core -> Worker). */
  async pair(id: string, usePairingCode?: boolean) {
    const chip = await this.get(id);
    const allowNoProxy = this.config.get<boolean>('ALLOW_PAIR_WITHOUT_PROXY');
    if (!chip.proxyId && !allowNoProxy) {
      // Anti-ban: proxy estavel deve estar ligado ANTES de parear.
      throw new BadRequestException(
        'ligue um proxy estavel no chip antes de parear (bind-proxy)',
      );
    }
    await this.control.add('control', {
      type: 'PAIR',
      chipId: id,
      usePairingCode,
    });
    return { enqueued: true };
  }

  /** Le o estado de pareamento (QR/code/status) publicado pelo worker no Redis. */
  async pairState(id: string): Promise<PairState> {
    await this.get(id);
    const raw = await this.redis.get(chipPairKey(id));
    if (!raw) {
      return { chipId: id, status: 'INIT', updatedAt: 0 };
    }
    return JSON.parse(raw) as PairState;
  }

  async sendControl(id: string, type: ControlCommand['type']) {
    await this.get(id);
    // o CORE é dono do status; o worker só liga/desliga a sessão
    if (type === 'STOP') {
      await this.prisma.whatsappNumber.update({
        where: { id },
        data: { status: 'PAUSED' },
      });
    } else if (type === 'RETIRE') {
      await this.prisma.whatsappNumber.update({
        where: { id },
        data: { status: 'RETIRED' },
      });
    }
    await this.control.add('control', { type, chipId: id });
    return { enqueued: true };
  }

  /** Renomeia o numero (o "nome" pelo qual voce o seleciona). */
  async rename(id: string, label: string) {
    await this.get(id);
    return this.prisma.whatsappNumber.update({
      where: { id },
      data: { label },
      select: { id: true, label: true, phone: true, status: true },
    });
  }

  /**
   * Insights por numero (identificados pelo NOME). Status, rampa, capacidade,
   * saude e taxa de resposta (aprox: msgs IN / OUT do chip).
   */
  async insights() {
    const chips = await this.prisma.whatsappNumber.findMany({
      orderBy: { label: 'asc' },
      select: {
        id: true,
        label: true,
        phone: true,
        status: true,
        rampDay: true,
        dailyCap: true,
        sentToday: true,
        healthScore: true,
        consecFails: true,
        lastSignalAt: true,
        proxyId: true,
      },
    });

    // contagem de mensagens por chip e direcao (1 query agregada)
    const counts = await this.prisma.message.groupBy({
      by: ['chipId', 'direction'],
      _count: { _all: true },
    });
    const byChip = new Map<string, { in: number; out: number }>();
    for (const c of counts) {
      if (!c.chipId) continue;
      const e = byChip.get(c.chipId) ?? { in: 0, out: 0 };
      if (c.direction === 'IN') e.in = c._count._all;
      else e.out = c._count._all;
      byChip.set(c.chipId, e);
    }

    return chips.map((chip) => {
      const m = byChip.get(chip.id) ?? { in: 0, out: 0 };
      const responseRate = m.out > 0 ? +(m.in / m.out).toFixed(3) : 0;
      return {
        ...chip,
        freeCapacity: Math.max(chip.dailyCap - chip.sentToday, 0),
        sent: m.out,
        received: m.in,
        responseRate, // aprox: respostas:envios
      };
    });
  }

  async health(id: string) {
    const chip = await this.prisma.whatsappNumber.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        healthScore: true,
        consecFails: true,
        lastSignalAt: true,
        sentToday: true,
        dailyCap: true,
      },
    });
    if (!chip) throw new NotFoundException('chip nao encontrado');
    return chip;
  }

  private async assertRegionMatch(phone: string, proxyId: string) {
    const proxy = await this.prisma.proxy.findUnique({ where: { id: proxyId } });
    if (!proxy) throw new BadRequestException('proxy nao encontrado');
    if (!proxy.active) throw new BadRequestException('proxy inativo');

    const country = ddiCountry(phone);
    const proxyCountry = proxy.region.split('-')[0]?.toUpperCase();
    if (country && proxyCountry && country !== proxyCountry) {
      throw new BadRequestException(
        `regiao do proxy (${proxy.region}) nao casa com o pais do numero (${country})`,
      );
    }
  }
}
