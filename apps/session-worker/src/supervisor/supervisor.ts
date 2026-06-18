import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  HealthSignalJob,
  InboundEvent,
  OpeningJob,
  OutboundJob,
  QUEUE,
} from '@dispatch/shared';
import { ChipSession, StubChipSession } from '../session/session';

/**
 * Coordena as sessoes deste worker:
 *  - mantem o mapa chipId -> ChipSession
 *  - consome OPENINGS/OUTBOUND (Core -> Worker) e roteia p/ a sessao do chip
 *  - publica INBOUND/HEALTH (Worker -> Core)
 *  - aplica kill switch (pausar/derrubar 1 chip sem afetar vizinhos)
 *  - health-check periodico por sessao
 *
 * Fase 1: wiring de filas + stubs de sessao. Baileys real entra na Fase 2.
 */
export class Supervisor {
  private readonly sessions = new Map<string, ChipSession>();
  private readonly workers: Worker[] = [];
  private inboundQueue!: Queue<InboundEvent>;
  private healthQueue!: Queue<HealthSignalJob>;
  private healthTimer?: NodeJS.Timeout;

  constructor(
    private readonly connection: Redis,
    private readonly workerId: string,
  ) {}

  async start(): Promise<void> {
    this.inboundQueue = new Queue<InboundEvent>(QUEUE.INBOUND, {
      connection: this.connection,
    });
    this.healthQueue = new Queue<HealthSignalJob>(QUEUE.HEALTH, {
      connection: this.connection,
    });

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

    this.healthTimer = setInterval(() => this.healthCheck(), 30_000);
    console.log(`[Supervisor ${this.workerId}] pronto (aguardando jobs)`);
  }

  /** Garante uma sessao p/ o chip (stub na Fase 1). */
  private ensureSession(chipId: string): ChipSession {
    let session = this.sessions.get(chipId);
    if (!session) {
      session = new StubChipSession(chipId);
      this.sessions.set(chipId, session);
      void session.start();
    }
    return session;
  }

  private async onOpening(job: OpeningJob): Promise<void> {
    // TODO Fase 2: this.ensureSession(job.chipId).send({...})
    console.log(
      `[Supervisor] OPENING lead=${job.leadId} chip=${job.chipId} (envio real na Fase 2)`,
    );
  }

  private async onOutbound(job: OutboundJob): Promise<void> {
    // TODO Fase 2: envio real pelo mesmo chip da conversa.
    console.log(
      `[Supervisor] OUTBOUND conv=${job.conversationId} chip=${job.chipId} (envio real na Fase 2)`,
    );
  }

  private healthCheck(): void {
    // TODO Fase 2/3: inspecionar cada sessao e publicar sinais em healthQueue.
  }

  /** Kill switch: pausa/derruba 1 chip isoladamente. */
  async killChip(chipId: string): Promise<void> {
    const session = this.sessions.get(chipId);
    if (session) await session.stop();
  }

  async stop(): Promise<void> {
    if (this.healthTimer) clearInterval(this.healthTimer);
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.sessions.values()].map((s) => s.stop()));
    await this.inboundQueue?.close();
    await this.healthQueue?.close();
  }
}
