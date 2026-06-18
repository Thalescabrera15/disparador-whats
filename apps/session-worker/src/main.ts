import { env } from './config/env';
import IORedis from 'ioredis';
import { Supervisor } from './supervisor/supervisor';

async function bootstrap(): Promise<void> {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  connection.on('connect', () => console.log('[Worker] Redis conectado'));
  connection.on('error', (err) => console.error('[Worker] Redis erro:', err.message));

  const supervisor = new Supervisor(connection, env.WORKER_ID);
  await supervisor.start();

  const shutdown = async (signal: string) => {
    console.log(`[Worker] ${signal} recebido, encerrando...`);
    await supervisor.stop();
    await connection.quit();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('[Worker] Falha no bootstrap:', err);
  process.exit(1);
});
