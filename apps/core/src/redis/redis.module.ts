import {
  Global,
  Logger,
  Module,
  OnApplicationShutdown,
  Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis, { Redis } from 'ioredis';
import { QUEUE } from '@dispatch/shared';
import {
  QUEUE_HEALTH,
  QUEUE_INBOUND,
  QUEUE_OPENINGS,
  QUEUE_OUTBOUND,
  REDIS_CONNECTION,
} from './redis.tokens';

const logger = new Logger('Redis');

const connectionProvider: Provider = {
  provide: REDIS_CONNECTION,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const url = config.getOrThrow<string>('REDIS_URL');
    // maxRetriesPerRequest: null -> exigido pelo BullMQ p/ comandos bloqueantes.
    const conn = new IORedis(url, { maxRetriesPerRequest: null });
    conn.on('connect', () => logger.log('Redis conectado'));
    conn.on('error', (err) => logger.error(`Redis erro: ${err.message}`));
    return conn;
  },
};

function queueProvider(token: string, name: string): Provider {
  return {
    provide: token,
    inject: [REDIS_CONNECTION],
    useFactory: (connection: Redis): Queue =>
      new Queue(name, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 24 * 3600 },
        },
      }),
  };
}

const queueProviders: Provider[] = [
  queueProvider(QUEUE_OPENINGS, QUEUE.OPENINGS),
  queueProvider(QUEUE_OUTBOUND, QUEUE.OUTBOUND),
  queueProvider(QUEUE_INBOUND, QUEUE.INBOUND),
  queueProvider(QUEUE_HEALTH, QUEUE.HEALTH),
];

@Global()
@Module({
  providers: [connectionProvider, ...queueProviders],
  exports: [
    REDIS_CONNECTION,
    QUEUE_OPENINGS,
    QUEUE_OUTBOUND,
    QUEUE_INBOUND,
    QUEUE_HEALTH,
  ],
})
export class RedisModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // Conexoes fecham junto com o processo; placeholder p/ cleanup explicito.
  }
}
