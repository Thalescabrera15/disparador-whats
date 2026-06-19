import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { InboundEvent, QUEUE } from '@dispatch/shared';
import { REDIS_CONNECTION } from '../redis/redis.tokens';
import { ConversationService } from './conversation.service';

/** Consome a fila INBOUND (Worker -> Core) e aciona o Conversational Engine. */
@Injectable()
export class InboundConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundConsumer.name);
  private worker?: Worker<InboundEvent>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly conversation: ConversationService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<InboundEvent>(
      QUEUE.INBOUND,
      async (job) => {
        await this.conversation.handleInbound(job.data);
      },
      { connection: this.connection, concurrency: 4 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`inbound job ${job?.id} falhou: ${err.message}`),
    );
    this.logger.log('Consumindo fila INBOUND');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
