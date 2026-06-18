import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as dotenv from 'dotenv';

/** Procura o .env subindo na arvore de diretorios (monorepo root). */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Sem .env local: assume env injetado pelo ambiente (Railway).
  dotenv.config();
}

loadRootEnv();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  REDIS_URL: required('REDIS_URL'),
  DATABASE_URL: required('DATABASE_URL'),
  /** Id deste worker (p/ rebalanceamento de chips entre workers). */
  WORKER_ID: process.env.WORKER_ID ?? 'worker-1',
};
