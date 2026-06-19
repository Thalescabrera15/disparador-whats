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
import { HealthMonitorService } from './health-monitor.service';

/** Consome a fila HEALTH (Worker -> Core) e alimenta o Health Monitor. */
@Injectable()
export class HealthConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthConsumer.name);
  private worker?: Worker<HealthSignalJob>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly monitor: HealthMonitorService,
  ) {}

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
    this.logger.log('Consumindo fila HEALTH');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
