import type { HealthSignalKind, OutboundMsgType } from '@dispatch/shared';

export type SessionStatus =
  | 'INIT'
  | 'PAIRING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'STOPPED';

export interface OutboundPayload {
  to: string;
  type: OutboundMsgType;
  parts: string[];
  mediaUrl?: string;
  typingDelaysMs?: number[];
}

/**
 * Contrato de uma sessao de chip (1 numero = 1 sessao Baileys = 1 proxy estavel).
 * Implementacao real (Baileys + persistencia de auth state no Postgres) entra na Fase 2.
 */
export interface ChipSession {
  readonly chipId: string;
  readonly status: SessionStatus;

  start(): Promise<void>;
  stop(): Promise<void>;
  /** Inicia pareamento; retorna QR/pairing code p/ exibir no painel. */
  requestPairing(): Promise<{ qr?: string; code?: string }>;
  send(payload: OutboundPayload): Promise<{ waMessageId?: string }>;
}

export type InboundHandler = (
  chipId: string,
  msg: { from: string; type: OutboundMsgType; content: string; mediaUrl?: string; waMessageId?: string },
) => void;

export type HealthHandler = (
  chipId: string,
  kind: HealthSignalKind,
  detail?: Record<string, unknown>,
) => void;

/**
 * Stub de sessao - placeholder ate a integracao Baileys (Fase 2).
 * Mantem o formato p/ o Supervisor compilar e orquestrar.
 */
export class StubChipSession implements ChipSession {
  status: SessionStatus = 'INIT';

  constructor(public readonly chipId: string) {}

  async start(): Promise<void> {
    this.status = 'DISCONNECTED';
    // TODO Fase 2: makeWASocket + bind proxy + carregar authState do Postgres.
  }

  async stop(): Promise<void> {
    this.status = 'STOPPED';
  }

  async requestPairing(): Promise<{ qr?: string; code?: string }> {
    throw new Error('Pairing nao implementado (Fase 2 - Baileys).');
  }

  async send(_payload: OutboundPayload): Promise<{ waMessageId?: string }> {
    throw new Error('Envio nao implementado (Fase 2 - Baileys).');
  }
}
