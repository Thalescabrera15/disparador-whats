import { env } from './config/env';
import IORedis from 'ioredis';
import { disconnectPrisma, prisma } from './db/prisma';
import { Supervisor } from './supervisor/supervisor';

async function bootstrap(): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  connection.on('connect', () => console.log('[Worker] Redis conectado'));
  connection.on('error', (err) => console.error('[Worker] Redis erro:', err.message));

  await prisma.$connect();
  console.log('[Worker] Postgres conectado');

  const supervisor = new Supervisor(connection, env.WORKER_ID, prisma);
  await supervisor.start();

  const shutdown = async (signal: string) => {
    console.log(`[Worker] ${signal} recebido, encerrando...`);
    await supervisor.stop();
    await connection.quit();
    await disconnectPrisma();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Worker] Falha no bootstrap:', err);
  process.exit(1);
});
