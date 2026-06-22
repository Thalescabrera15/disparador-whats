import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChipStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import {
  FlowSendConfig,
  HEALTH_THRESHOLDS,
  OpeningJob,
  parseSendConfig,
  perChipFactor,
} from '@dispatch/shared';
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

type OpeningRow = { id: string; template: string; weight: number };

export interface TickResult {
  ranAt: string;
  runningDispatches: number;
  enqueued: number;
  perChip: Record<string, number>;
  finishedDispatches: string[];
}

/**
 * Motor de disparo. A cada tick, para cada Disparo RUNNING:
 *  - sorteia 1 chip elegivel (capacidade livre + jitter cumprido)
 *  - reivindica 1 lead PENDING, abertura variada (anti-repeticao por chip)
 *  - enfileira envio humanizado no worker
 * Respeita rampa/teto/janela/jitter por chip (anti-ban).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  private readonly defaultRampCurve: number[];
  private readonly defaultJitterMin: number;
  private readonly defaultJitterMax: number;
  private readonly tickMs: number;
  private readonly enabled: boolean;
  private readonly tz: string;
  private readonly warmingActiveAfterDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(QUEUE_OPENINGS) private readonly openings: Queue<OpeningJob>,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {
    this.defaultRampCurve = this.parseRampCurve(
      config.get<string>('RAMP_CURVE') ?? '5,8,15,25,35,45,55',
    );
    this.defaultJitterMin = config.get<number>('JITTER_MIN_MS', 45000);
    this.defaultJitterMax = config.get<number>('JITTER_MAX_MS', 180000);
    this.tickMs = config.get<number>('SCHEDULER_TICK_MS', 15000);
    this.enabled = config.get<boolean>('SCHEDULER_ENABLED', true);
    this.tz = config.get<string>('SCHEDULER_TZ', 'America/Sao_Paulo');
    this.warmingActiveAfterDays = config.get<number>(
      'WARMING_ACTIVE_AFTER_DAYS',
      this.defaultRampCurve.length,
    );
  }

  private parseRampCurve(raw: string): number[] {
    return raw
      .split(',')
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  private nowInTz(): { hour: number; weekday: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.tz,
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    }).formatToParts(new Date());
    const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const wdStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { hour: parseInt(hourStr, 10) % 24, weekday: days.indexOf(wdStr) };
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
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`tick falhou: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

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
        flow: { select: { id: true, variables: true, sendConfig: true } },
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
        select: { id: true, template: true, weight: true },
      });
      if (openings.length === 0) continue;

      const sendCfg = parseSendConfig(dispatch.flow.sendConfig);
      const chip = await this.pickEligibleChip(
        dispatch.chips as ChipRow[],
        sendCfg,
      );
      if (!chip) continue;

      const sent = await this.dispatchOne(
        dispatch.flowId,
        dispatch.flow.variables,
        dispatch.allowLinkInOpening,
        chip,
        openings,
        sendCfg,
      );
      if (sent) {
        result.enqueued++;
        result.perChip[chip.label] = (result.perChip[chip.label] ?? 0) + 1;
        await this.armNextSend(chip.id, sendCfg);
      }
    }

    return result;
  }

  private async dispatchOne(
    flowId: string,
    flowVariables: unknown,
    allowLink: boolean,
    chip: ChipRow,
    openings: OpeningRow[],
    sendCfg: FlowSendConfig,
  ): Promise<boolean> {
    const lead = await this.prisma.lead.findFirst({
      where: { flowId, status: 'PENDING', suppressed: false },
      orderBy: { createdAt: 'asc' },
    });
    if (!lead) return false;

    const claim = await this.prisma.lead.updateMany({
      where: { id: lead.id, status: 'PENDING' },
      data: { status: 'QUEUED' },
    });
    if (claim.count !== 1) return false;

    try {
      const opening = await this.pickOpeningForChip(chip.id, openings);
      const extras = allowLink ? { link: '' } : {};
      const ctx = buildLeadContext(lead, flowVariables, extras);
      const text = renderTemplate(opening.template, ctx);
      const typingDelayMs = this.typingDelay(text);

      const conv = await this.prisma.conversation.upsert({
        where: { leadId: lead.id },
        update: {},
        create: { leadId: lead.id, flowId, state: 'WAITING_REPLY' },
      });
      const msg = await this.prisma.message.create({
        data: {
          conversationId: conv.id,
          chipId: chip.id,
          direction: 'OUT',
          type: 'TEXT',
          content: text,
        },
      });

      await this.openings.add('opening', {
        leadId: lead.id,
        chipId: chip.id,
        messageId: msg.id,
        to: lead.phone,
        text,
        typingDelayMs,
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

  /** Sorteia 1 chip elegivel, ponderado pela capacidade livre restante. */
  private async pickEligibleChip(
    chips: ChipRow[],
    sendCfg: FlowSendConfig,
  ): Promise<ChipRow | null> {
    const eligible: ChipRow[] = [];
    for (const chip of chips) {
      if (!this.canSend(chip, sendCfg)) continue;
      if (!(await this.dueBySchedule(chip.id))) continue;
      eligible.push(chip);
    }
    if (eligible.length === 0) return null;

    const weights = eligible.map((c) =>
      Math.max(c.dailyCap - c.sentToday, 1),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < eligible.length; i++) {
      r -= weights[i];
      if (r <= 0) return eligible[i];
    }
    return eligible[eligible.length - 1];
  }

  private canSend(chip: ChipRow, sendCfg: FlowSendConfig): boolean {
    if (chip.status !== 'ACTIVE' && chip.status !== 'WARMING') return false;
    if (chip.healthScore < HEALTH_THRESHOLDS.COOLDOWN) return false;
    if (chip.dailyCap - chip.sentToday <= 0) return false;
    if (!this.inWindow(chip, sendCfg)) return false;
    if (this.isRestDay(chip)) return false;
    return true;
  }

  private inWindow(chip: ChipRow, sendCfg: FlowSendConfig): boolean {
    const start = sendCfg.window?.start ?? chip.windowStart;
    const end = sendCfg.window?.end ?? chip.windowEnd;
    const { hour } = this.nowInTz();
    return hour >= start && hour < end;
  }

  private isRestDay(chip: ChipRow): boolean {
    const days = Array.isArray(chip.restDays) ? (chip.restDays as number[]) : [];
    return days.includes(this.nowInTz().weekday);
  }

  private async dueBySchedule(chipId: string): Promise<boolean> {
    const raw = await this.redis.get(`sched:nextSend:${chipId}`);
    return !raw || Number(raw) <= Date.now();
  }

  private async armNextSend(chipId: string, sendCfg: FlowSendConfig): Promise<void> {
    const jitterMin = sendCfg.jitterMs?.min ?? this.defaultJitterMin;
    const jitterMax = sendCfg.jitterMs?.max ?? this.defaultJitterMax;
    const base =
      jitterMin +
      Math.floor(Math.random() * Math.max(jitterMax - jitterMin, 1));
    const jitter = Math.round(base * perChipFactor(chipId));
    await this.redis.set(
      `sched:nextSend:${chipId}`,
      String(Date.now() + jitter),
      'EX',
      86400,
    );
  }

  /** Sorteio ponderado evitando templates usados recentemente por este chip. */
  private async pickOpeningForChip(
    chipId: string,
    openings: OpeningRow[],
  ): Promise<OpeningRow> {
    const key = `opening:recent:${chipId}`;
    const recent = new Set(await this.redis.lrange(key, 0, -1));
    let pool = openings.filter((o) => !recent.has(o.id));
    if (pool.length === 0) pool = openings;

    const picked = this.pickOpening(pool);
    await this.redis.lpush(key, picked.id);
    await this.redis.ltrim(key, 0, 4);
    await this.redis.expire(key, 86400 * 7);
    return picked;
  }

  private pickOpening<T extends { weight: number }>(openings: T[]): T {
    const total = openings.reduce((s, o) => s + Math.max(o.weight, 1), 0);
    let r = Math.random() * total;
    for (const o of openings) {
      r -= Math.max(o.weight, 1);
      if (r <= 0) return o;
    }
    return openings[openings.length - 1];
  }

  private typingDelay(text: string): number {
    const base = Math.min(Math.max(text.length * 45, 1500), 9000);
    return base + 500 + Math.floor(Math.random() * 1500);
  }

  private dailyCapForRamp(rampDay: number, sendCfg: FlowSendConfig): number {
    const curve = sendCfg.rampCurve ?? this.defaultRampCurve;
    if (rampDay <= 0 || curve.length === 0) return 0;
    const cap = curve[Math.min(rampDay - 1, curve.length - 1)];
    if (sendCfg.dailyCapPerChip) {
      return Math.min(cap, sendCfg.dailyCapPerChip);
    }
    return cap;
  }

  private async resetDailyIfNeeded(): Promise<void> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const chips = await this.prisma.whatsappNumber.findMany({
      where: {
        status: { in: ['WARMING', 'ACTIVE', 'COOLDOWN'] },
        OR: [{ lastResetAt: null }, { lastResetAt: { lt: start } }],
      },
      select: { id: true, rampDay: true, status: true },
    });

    for (const c of chips) {
      const newRamp = c.rampDay + 1;
      const promote =
        c.status === ChipStatus.WARMING &&
        newRamp >= this.warmingActiveAfterDays;
      await this.prisma.whatsappNumber.update({
        where: { id: c.id },
        data: {
          sentToday: 0,
          rampDay: newRamp,
          dailyCap: this.dailyCapForRamp(newRamp, {}),
          lastResetAt: new Date(),
          ...(promote ? { status: ChipStatus.ACTIVE } : {}),
        },
      });
    }
    if (chips.length) {
      this.logger.log(`reset diario aplicado a ${chips.length} chip(s)`);
    }
  }
}
