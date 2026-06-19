import { Prisma, type PrismaClient } from '@prisma/client';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  chipPairKey,
  ControlCommand,
  HealthSignalJob,
  InboundEvent,
  OpeningJob,
  OutboundJob,
  PAIR_STATE_TTL_SEC,
  PairState,
  QUEUE,
  type HealthSignalKind,
} from '@dispatch/shared';
import { env } from '../config/env';
import { BaileysSession } from '../session/baileys-session';
import type { ChipSession, SessionStatus } from '../session/session';
import type { ProxyConfig } from '../proxy/proxy';

/**
 * Coordena as sessoes deste worker:
 *  - consome CONTROL (Core -> Worker): PAIR/START/STOP/RETIRE
 *  - consome OPENINGS/OUTBOUND e roteia p/ a sessao do chip
 *  - publica estado de pareamento (QR/status) no Redis p/ o painel
 *  - publica INBOUND/HEALTH (Worker -> Core)
 *  - reflete status do chip no Postgres
 */
export class Supervisor {
  private readonly sessions = new Map<string, ChipSession>();
  private readonly workers: Worker[] = [];
  private inboundQueue!: Queue<InboundEvent>;
  private healthQueue!: Queue<HealthSignalJob>;

  constructor(
    private readonly connection: Redis,
    private readonly workerId: string,
    private readonly prisma: PrismaClient,
  ) {}

  async start(): Promise<void> {
    this.inboundQueue = new Queue<InboundEvent>(QUEUE.INBOUND, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 24 * 3600 },
      },
    });
    this.healthQueue = new Queue<HealthSignalJob>(QUEUE.HEALTH, {
      connection: this.connection,
    });

    this.workers.push(
      new Worker<ControlCommand>(QUEUE.CONTROL, (job) => this.onControl(job.data), {
        connection: this.connection,
        concurrency: 4,
      }),
    );
    this.workers.push(
      new Worker<OpeningJob>(QUEUE.OPENINGS, (job) => this.onOpening(job.data), {
        connection: this.connection,
      }),
    );
    this.workers.push(
      new Worker<OutboundJob>(QUEUE.OUTBOUND, (job) => this.onOutbound(job.data), {
        connection: this.connection,
      }),
    );

    console.log(`[Supervisor ${this.workerId}] pronto (aguardando comandos/jobs)`);
    void this.recoverSessions(); // re-sobe sessoes em background (com stagger)
  }

  /**
   * Auto-recovery: ao subir, re-conecta os chips que estavam vivos
   * (ACTIVE/WARMING com auth state). Stagger anti-ban: nunca reconectar a frota
   * inteira em uníssono.
   */
  private async recoverSessions(): Promise<void> {
    const chips = await this.prisma.whatsappNumber.findMany({
      where: {
        status: { in: ['ACTIVE', 'WARMING'] },
        authState: { not: Prisma.DbNull },
      },
      select: { id: true },
    });
    if (!chips.length) return;
    console.log(`[Supervisor ${this.workerId}] recuperando ${chips.length} sessao(oes)...`);
    for (const chip of chips) {
      if (this.sessions.has(chip.id)) continue;
      await this.startSession(chip.id);
      // intervalo 3-7s entre reconexoes (anti-thundering-herd / anti-ban)
      await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 4000)));
    }
  }

  // ---------------- ciclo de vida da sessao ----------------

  private async onControl(cmd: ControlCommand): Promise<void> {
    console.log(`[Supervisor] CONTROL ${cmd.type} chip=${cmd.chipId}`);
    switch (cmd.type) {
      case 'PAIR':
      case 'START':
        await this.startSession(cmd.chipId, cmd.usePairingCode);
        break;
      case 'STOP':
      case 'RETIRE':
        await this.stopSession(cmd.chipId);
        break;
    }
  }

  private async startSession(
    chipId: string,
    usePairingCode?: boolean,
  ): Promise<void> {
    if (this.sessions.has(chipId)) return; // ja ativa

    const chip = await this.prisma.whatsappNumber.findUnique({
      where: { id: chipId },
      select: { id: true, phone: true },
    });
    if (!chip) {
      console.error(`[Supervisor] chip ${chipId} inexistente`);
      return;
    }

    const session = new BaileysSession({
      prisma: this.prisma,
      chipId,
      phone: chip.phone,
      usePairingCode,
      allowWithoutProxy: env.ALLOW_PAIR_WITHOUT_PROXY,
      getProxy: () => this.loadProxy(chipId),
      hooks: {
        onStatus: (id, status) => void this.publishPairState(id, status),
        onQR: (id, qr) => void this.publishPairState(id, 'PAIRING', { qr }),
        onPairingCode: (id, code) =>
          void this.publishPairState(id, 'PAIRING', { code }),
        onInbound: (id, msg) => void this.publishInbound(id, msg),
        onHealth: (id, kind, detail) => void this.publishHealth(id, kind, detail),
      },
    });

    this.sessions.set(chipId, session);
    try {
      await session.start();
    } catch (err) {
      console.error(`[Supervisor] falha ao iniciar sessao ${chipId}:`, err);
      this.sessions.delete(chipId);
    }
  }

  /**
   * Para a sessao deste worker (se hospeda o chip). NAO escreve status: o CORE
   * é dono do status (evita clobber cross-worker via fila CONTROL compartilhada).
   */
  private async stopSession(chipId: string): Promise<void> {
    const session = this.sessions.get(chipId);
    if (!session) return;
    await session.stop();
    this.sessions.delete(chipId);
  }

  /** Kill switch: derruba 1 chip isoladamente (sem afetar vizinhos). */
  async killChip(chipId: string): Promise<void> {
    await this.stopSession(chipId);
  }

  // ---------------- envio (roteamento de jobs) ----------------

  private async onOpening(job: OpeningJob): Promise<void> {
    const session = this.sessions.get(job.chipId);
    if (!session) {
      await this.publishHealth(job.chipId, 'SEND_FAIL', { reason: 'no_session' });
      throw new Error(`sessao do chip ${job.chipId} nao esta ativa`);
    }
    try {
      await session.send({
        to: job.to,
        type: 'TEXT',
        parts: [job.text],
        typingDelaysMs: job.typingDelayMs ? [job.typingDelayMs] : undefined,
      });
    } catch (err) {
      await this.publishHealth(job.chipId, 'SEND_FAIL', {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  private async onOutbound(job: OutboundJob): Promise<void> {
    const session = this.sessions.get(job.chipId);
    if (!session) throw new Error(`sessao do chip ${job.chipId} nao esta ativa`);
    await session.send({
      to: job.to,
      type: job.type,
      parts: job.parts,
      mediaUrl: job.mediaUrl,
      typingDelaysMs: job.typingDelaysMs,
    });
  }

  // ---------------- publicacao de estado ----------------

  private async publishPairState(
    chipId: string,
    status: SessionStatus,
    extra?: { qr?: string; code?: string },
  ): Promise<void> {
    const state: PairState = {
      chipId,
      status,
      qr: extra?.qr,
      code: extra?.code,
      updatedAt: Date.now(),
    };
    await this.connection.set(
      chipPairKey(chipId),
      JSON.stringify(state),
      'EX',
      PAIR_STATE_TTL_SEC,
    );

    // Reflete no Postgres: chip recem-conectado entra aquecendo (rampa minima).
    // lastResetAt=now garante que o reset diario nao "pule" o dia 1.
    if (status === 'CONNECTED') {
      const now = new Date();
      await this.prisma.whatsappNumber.updateMany({
        where: { id: chipId, status: 'NEW' },
        data: { status: 'WARMING', rampDay: 1, dailyCap: 5, lastResetAt: now },
      });
      await this.prisma.whatsappNumber.update({
        where: { id: chipId },
        data: { lastSignalAt: now },
      });
    }
  }

  private async publishInbound(
    chipId: string,
    msg: {
      from: string;
      type: InboundEvent['type'];
      content: string;
      mediaUrl?: string;
      waMessageId?: string;
    },
  ): Promise<void> {
    const event: InboundEvent = {
      chipId,
      from: msg.from,
      type: msg.type,
      content: msg.content,
      mediaUrl: msg.mediaUrl,
      waMessageId: msg.waMessageId,
      timestamp: Date.now(),
    };
    // jobId pelo waMessageId: redelivery do MESMO inbound não duplica o job.
    await this.inboundQueue.add('inbound', event, {
      jobId: msg.waMessageId ? `in:${chipId}:${msg.waMessageId}` : undefined,
    });
  }

  private async publishHealth(
    chipId: string,
    kind: HealthSignalKind,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    await this.healthQueue.add('health', {
      chipId,
      kind,
      detail,
      timestamp: Date.now(),
    });
  }

  // ---------------- proxy ----------------

  private async loadProxy(chipId: string): Promise<ProxyConfig | null> {
    const chip = await this.prisma.whatsappNumber.findUnique({
      where: { id: chipId },
      select: {
        proxy: {
          select: {
            host: true,
            port: true,
            username: true,
            password: true,
            type: true,
            region: true,
          },
        },
      },
    });
    if (!chip?.proxy) return null;
    return { ...chip.proxy, protocol: 'http' };
  }

  // ---------------- shutdown ----------------

  async stop(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.stop()));
    await Promise.all(this.workers.map((w) => w.close()));
    await this.inboundQueue?.close();
    await this.healthQueue?.close();
  }
}
