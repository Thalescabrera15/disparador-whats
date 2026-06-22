import { Prisma, type PrismaClient } from '@prisma/client';
import { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
} from 'baileys';
import pino from 'pino';
import type { HealthSignalKind } from '@dispatch/shared';
import {
  usePostgresAuthState,
  type PostgresAuthState,
} from '../baileys/postgres-auth-state';
import { buildProxyAgent, type ProxyConfig } from '../proxy/proxy';
import type {
  ChipSession,
  InboundHandler,
  OutboundPayload,
  SessionStatus,
} from './session';

const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL ?? 'silent' });

export interface SessionHooks {
  onStatus?: (chipId: string, status: SessionStatus) => void;
  onQR?: (chipId: string, qr: string) => void;
  onPairingCode?: (chipId: string, code: string) => void;
  onInbound?: InboundHandler;
  onHealth?: (
    chipId: string,
    kind: HealthSignalKind,
    detail?: Record<string, unknown>,
  ) => void;
}

export interface BaileysSessionOptions {
  prisma: PrismaClient;
  chipId: string;
  phone: string; // E.164
  /** Carrega o proxy estavel do chip (null = sem proxy). */
  getProxy: () => Promise<ProxyConfig | null>;
  /** Permite conectar sem proxy (DEV). Default false (anti-ban exige proxy). */
  allowWithoutProxy?: boolean;
  /** Pareamento por codigo (8 digitos) em vez de QR. */
  usePairingCode?: boolean;
  hooks?: SessionHooks;
}

const MAX_BACKOFF_MS = 60_000;

/** Sessao Baileys real de 1 chip (1 numero : 1 proxy estavel). */
export class BaileysSession implements ChipSession {
  readonly chipId: string;
  status: SessionStatus = 'INIT';

  private sock?: WASocket;
  private auth?: PostgresAuthState; // carregado UMA vez, reusado entre reconexoes
  private latestQR?: string;
  private pairingCode?: string;
  private reconnectAttempts = 0;
  private stopping = false;
  private reconnecting = false;
  private pairingRequested = false;

  constructor(private readonly opts: BaileysSessionOptions) {
    this.chipId = opts.chipId;
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.teardownSocket(); // garante que nao haja socket/listeners orfaos
    const { prisma, chipId } = this.opts;

    // anti-ban: nunca conectar sem proxy estavel (espelha o guard do Core).
    const proxy = await this.opts.getProxy();
    if (!proxy && !this.opts.allowWithoutProxy) {
      this.setStatus('STOPPED');
      this.opts.hooks?.onHealth?.(chipId, 'DISCONNECT', { reason: 'no_proxy' });
      throw new Error(
        `chip ${chipId}: recusando conectar sem proxy estavel (anti-ban)`,
      );
    }
    const agent = proxy ? buildProxyAgent(proxy) : undefined;

    if (!this.auth) {
      this.auth = await usePostgresAuthState(prisma, chipId);
    }

    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: {
        creds: this.auth.state.creds,
        keys: makeCacheableSignalKeyStore(this.auth.state.keys, logger),
      },
      agent,
      fetchAgent: agent,
      browser: Browsers.ubuntu('Chrome'),
      logger,
      markOnlineOnConnect: false, // anti-ban: nao ficar online na cara
      syncFullHistory: false,
    });

    this.setStatus('PAIRING');
    this.bindEvents(this.sock);
  }

  /** Encerra o socket atual SEM deslogar (preserva creds) e limpa listeners. */
  private teardownSocket(): void {
    if (!this.sock) return;
    try {
      this.sock.ev.removeAllListeners('connection.update');
      this.sock.ev.removeAllListeners('creds.update');
      this.sock.ev.removeAllListeners('messages.upsert');
    } catch {
      /* noop */
    }
    try {
      this.sock.end(undefined);
    } catch {
      /* noop */
    }
    this.sock = undefined;
  }

  private bindEvents(sock: WASocket): void {
    const { chipId, hooks } = this.opts;

    sock.ev.on('creds.update', () => {
      // .catch obrigatorio: sem isso, uma rejeicao vira unhandledRejection
      // e pode derrubar o worker no meio do disparo.
      this.auth?.saveCreds().catch((err) => {
        logger.error({ chipId, err }, 'falha ao salvar creds');
      });
    });

    sock.ev.on('connection.update', async (update) => {
      if (this.sock !== sock) return; // descarta eventos de socket orfao
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.latestQR = qr;
        hooks?.onQR?.(chipId, qr);
        await this.maybeRequestPairingCode();
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0;
        this.latestQR = undefined;
        this.pairingCode = undefined;
        this.setStatus('CONNECTED');
        hooks?.onHealth?.(chipId, 'RECOVERED', { reason: 'connection_open' });
      }

      if (connection === 'close') {
        this.setStatus('DISCONNECTED');
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        hooks?.onHealth?.(chipId, 'DISCONNECT', { statusCode });

        if (this.stopping) {
          this.setStatus('STOPPED');
          return;
        }
        if (loggedOut) {
          // deslogado pelo telefone: creds invalidas. Limpa o authState
          // para o proximo start emitir QR/pairing novo (senao loop infinito).
          await this.wipeAuth();
          this.setStatus('STOPPED');
          return;
        }
        void this.scheduleReconnect();
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (this.sock !== sock) return; // ignora socket orfao
      if (type !== 'notify') return;
      for (const m of messages) {
        if (m.key.fromMe || !m.message) continue;
        const remoteJid = m.key.remoteJid ?? '';
        if (!remoteJid || remoteJid.endsWith('@g.us')) continue; // ignora grupos
        const from = remoteJid.replace('@s.whatsapp.net', '');
        if (!from) continue;
        const text =
          m.message.conversation ?? m.message.extendedTextMessage?.text ?? '';
        hooks?.onInbound?.(chipId, {
          from,
          type: m.message.audioMessage
            ? 'AUDIO'
            : m.message.imageMessage
              ? 'IMAGE'
              : m.message.documentMessage
                ? 'PDF'
                : 'TEXT',
          content: text,
          waMessageId: m.key.id ?? undefined,
        });
      }
    });

    // Receipts de entrega/leitura (anti-ban: monitor de saude por chip).
    sock.ev.on('messages.update', (updates) => {
      if (this.sock !== sock) return;
      for (const { key, update } of updates) {
        if (!key.fromMe || !key.id) continue;
        const status = update.status;
        if (status === undefined || status === null) continue;
        // WAMessageStatus: SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5
        if (status >= 3) {
          void this.markDelivered(key.id);
        }
        if (status >= 4) {
          void this.markRead(key.id);
        }
      }
    });
  }

  /** Apaga creds persistidas (apos logoff) p/ forcar novo pareamento. */
  private async wipeAuth(): Promise<void> {
    this.pairingRequested = false;
    // espera escrita em voo terminar antes de zerar (evita re-gravar creds velhas)
    try {
      await this.auth?.flush();
    } catch {
      /* noop */
    }
    this.auth = undefined;
    try {
      await this.opts.prisma.whatsappNumber.update({
        where: { id: this.chipId },
        data: { authState: Prisma.DbNull },
      });
    } catch (err) {
      logger.error({ chipId: this.chipId, err }, 'falha ao limpar authState');
    }
  }

  private async maybeRequestPairingCode(): Promise<void> {
    if (!this.opts.usePairingCode || this.pairingRequested) return;
    if (this.sock?.authState.creds.registered) return;
    this.pairingRequested = true;
    try {
      const digits = this.opts.phone.replace(/\D/g, '');
      const code = await this.sock!.requestPairingCode(digits);
      this.pairingCode = code;
      this.opts.hooks?.onPairingCode?.(this.chipId, code);
    } catch (err) {
      this.pairingRequested = false;
      logger.error({ chipId: this.chipId, err }, 'falha ao pedir pairing code');
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnecting || this.stopping) return;
    this.reconnecting = true;
    try {
      this.reconnectAttempts += 1;
      const delay = Math.min(1000 * 2 ** this.reconnectAttempts, MAX_BACKOFF_MS);
      await new Promise((r) => setTimeout(r, delay));
      if (this.stopping) return;
      await this.start();
    } catch (err) {
      // start() pode lancar (ex: sem proxy). Nao re-loopar em tight loop:
      // o proximo 'close' do socket (se houver) re-agenda; senao para aqui.
      logger.error({ chipId: this.chipId, err }, 'falha ao reconectar');
    } finally {
      this.reconnecting = false;
    }
  }

  async requestPairing(): Promise<{ qr?: string; code?: string }> {
    if (!this.sock) await this.start();
    return { qr: this.latestQR, code: this.pairingCode };
  }

  async send(payload: OutboundPayload): Promise<{ waMessageId?: string }> {
    const sock = this.sock;
    if (!sock || this.status !== 'CONNECTED') {
      throw new Error(`chip ${this.chipId} nao conectado (status=${this.status})`);
    }
    const jid = `${payload.to.replace(/\D/g, '')}@s.whatsapp.net`;
    let lastId: string | undefined;

    try {
      for (let i = 0; i < payload.parts.length; i++) {
        // aborta se o socket mudou (reconexao no meio de um envio multi-parte)
        if (this.sock !== sock || this.status !== 'CONNECTED') {
          throw new Error(`chip ${this.chipId}: sessao mudou durante o envio`);
        }
        const part = payload.parts[i];
        const delay = payload.typingDelaysMs?.[i] ?? 0;
        if (delay > 0) {
          await sock.sendPresenceUpdate('composing', jid);
          await new Promise((r) => setTimeout(r, delay));
          await sock.sendPresenceUpdate('paused', jid);
        }
        const sent = await sock.sendMessage(jid, { text: part });
        lastId = sent?.key.id ?? undefined;
      }
      return { waMessageId: lastId };
    } catch (err) {
      this.opts.hooks?.onHealth?.(this.chipId, 'SEND_FAIL', {
        error: (err as Error).message,
      });
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.teardownSocket();
    try {
      await this.auth?.flush();
    } catch {
      /* noop */
    }
    this.setStatus('STOPPED');
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;
    this.opts.hooks?.onStatus?.(this.chipId, status);
  }

  private async markDelivered(waMessageId: string): Promise<void> {
    try {
      await this.opts.prisma.message.updateMany({
        where: {
          chipId: this.chipId,
          waMessageId,
          deliveredAt: null,
        },
        data: { deliveredAt: new Date() },
      });
    } catch (err) {
      logger.warn({ chipId: this.chipId, waMessageId, err }, 'markDelivered falhou');
    }
  }

  private async markRead(waMessageId: string): Promise<void> {
    try {
      await this.opts.prisma.message.updateMany({
        where: {
          chipId: this.chipId,
          waMessageId,
          readAt: null,
        },
        data: { readAt: new Date() },
      });
    } catch (err) {
      logger.warn({ chipId: this.chipId, waMessageId, err }, 'markRead falhou');
    }
  }
}
