import type { PrismaClient } from '@prisma/client';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from 'baileys';

type KeyStore = Record<string, Record<string, unknown>>;

interface AuthMemory {
  creds: AuthenticationCreds;
  keys: KeyStore;
}

/**
 * Auth state do Baileys persistido no Postgres (WhatsappNumber.authState).
 *
 * NAO-NEGOCIAVEL: o auth state vive no banco, nunca so em disco efemero.
 * Perder isso = re-login (QR de novo) = dor + sinal de risco anti-ban.
 *
 * Serializacao: o blob inteiro vai como string (JSON.stringify com BufferJSON.replacer)
 * dentro da coluna Json, e volta com BufferJSON.reviver. Isso preserva Buffers/Uint8Array
 * exatamente como o Baileys espera.
 *
 * Escritas sao "coalesced": no maximo uma escrita em voo por chip; bursts de
 * keys.set durante um await sao agrupados na proxima iteracao (sem perder updates).
 */
export interface PostgresAuthState {
  state: AuthenticationState;
  /** Persiste o estado atual (chamado em creds.update e a cada keys.set). */
  saveCreds: () => Promise<void>;
  /** Aguarda qualquer escrita em voo terminar (evita corrida no teardown/wipe). */
  flush: () => Promise<void>;
}

export async function usePostgresAuthState(
  prisma: PrismaClient,
  chipId: string,
): Promise<PostgresAuthState> {
  const memory = await loadMemory(prisma, chipId);

  // --- write coalescer ---
  // No maximo uma escrita em voo por chip. Em erro transitorio de DB, mantem
  // 'dirty' para retry na proxima escrita e NUNCA reusa a promise rejeitada
  // (senao a persistencia travaria pra sempre -> re-login/QR, inaceitavel).
  let dirty = false;
  let writing: Promise<void> | null = null;

  const runWrites = async (): Promise<void> => {
    try {
      while (dirty) {
        dirty = false;
        const serialized = JSON.stringify(memory, BufferJSON.replacer);
        try {
          await prisma.whatsappNumber.update({
            where: { id: chipId },
            data: { authState: serialized },
          });
        } catch (err) {
          dirty = true; // reagenda na proxima escrita
          console.error(
            `[auth-state ${chipId}] falha ao persistir:`,
            (err as Error).message,
          );
          break;
        }
      }
    } finally {
      writing = null;
    }
  };

  const persist = (): Promise<void> => {
    dirty = true;
    if (!writing) writing = runWrites();
    return writing;
  };

  const flush = (): Promise<void> => writing ?? Promise.resolve();

  return {
    flush,
    saveCreds: persist,
    state: {
      creds: memory.creds,
      keys: {
        get: async (type, ids) => {
          const bucket = memory.keys[type] ?? {};
          const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          for (const id of ids) {
            let value = bucket[id];
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as object,
              );
            }
            if (value !== undefined) {
              out[id] = value as SignalDataTypeMap[typeof type];
            }
          }
          return out;
        },
        set: async (data) => {
          for (const type of Object.keys(data) as (keyof typeof data)[]) {
            const bucket = (memory.keys[type as string] ??= {});
            const entries = data[type]!;
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              if (value === null || value === undefined) {
                delete bucket[id];
              } else {
                bucket[id] = value;
              }
            }
          }
          await persist();
        },
        clear: async () => {
          memory.keys = {};
          await persist();
        },
      },
    },
  };
}

async function loadMemory(
  prisma: PrismaClient,
  chipId: string,
): Promise<AuthMemory> {
  const row = await prisma.whatsappNumber.findUnique({
    where: { id: chipId },
    select: { authState: true },
  });

  if (row?.authState && typeof row.authState === 'string') {
    try {
      const parsed = JSON.parse(row.authState, BufferJSON.reviver) as AuthMemory;
      if (parsed?.creds) {
        return { creds: parsed.creds, keys: parsed.keys ?? {} };
      }
    } catch {
      // blob corrompido -> recomeca limpo (forca novo pareamento)
    }
  }

  return { creds: initAuthCreds(), keys: {} };
}
