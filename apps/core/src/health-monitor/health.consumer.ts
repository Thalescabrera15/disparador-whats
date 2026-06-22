import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { HealthSignalJob, QUEUE } from '@dispatch/shared';
import { REDIS_CONNECTION } from '../redis/redis.tokens';
import { DeliveryMonitorService } from './delivery-monitor.service';
import { HealthMonitorService } from './health-monitor.service';

/** Consome a fila HEALTH (Worker -> Core) e alimenta o Health Monitor. */
@Injectable()
export class HealthConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthConsumer.name);
  private worker?: Worker<HealthSignalJob>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly monitor: HealthMonitorService,
    private readonly delivery: DeliveryMonitorService,
  ) {}

  private sweepTimer?: NodeJS.Timeout;
  private deliveryTimer?: NodeJS.Timeout;

  onModuleInit(): void {
    this.worker = new Worker<HealthSignalJob>(
      QUEUE.HEALTH,
      async (job) => {
        await this.monitor.ingestSignal(
          job.data.chipId,
          job.data.kind,
          job.data.detail,
        );
      },
      { connection: this.connection, concurrency: 4 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`health job ${job?.id} falhou: ${err.message}`),
    );
    this.sweepTimer = setInterval(
      () =>
        void this.monitor
          .sweepCooldowns()
          .catch((e) => this.logger.error(`sweepCooldowns: ${e.message}`)),
      5 * 60_000,
    );
    this.deliveryTimer = setInterval(
      () =>
        void this.delivery
          .sweep()
          .catch((e) => this.logger.error(`delivery sweep: ${e.message}`)),
      2 * 60_000,
    );
    this.logger.log('Consumindo fila HEALTH');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    await this.worker?.close();
  }
}
