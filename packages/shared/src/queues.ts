/**
 * Contratos de fila (BullMQ) entre o Core (NestJS) e os Session Workers (Baileys).
 * Redis e o unico meio de comunicacao entre os dois processos.
 *
 * Direcao:
 *   OPENINGS / OUTBOUND : Core  -> Worker (mandar mensagem por um chip)
 *   INBOUND  / HEALTH   : Worker -> Core  (evento recebido / sinal de saude)
 */

export const QUEUE = {
  /** Scheduler enfileira aberturas variadas (SEM link) p/ o worker enviar. */
  OPENINGS: 'openings',
  /** Conversational Engine enfileira respostas da IA (mesmo chip do lead). */
  OUTBOUND: 'outbound',
  /** Worker publica mensagens inbound recebidas dos leads. */
  INBOUND: 'inbound',
  /** Worker publica sinais de saude inferidos (falha, sem read, disconnect...). */
  HEALTH: 'health',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

export type OutboundMsgType = 'TEXT' | 'AUDIO' | 'IMAGE' | 'PDF';

/** Job: enviar abertura por um chip especifico. Core -> Worker. */
export interface OpeningJob {
  leadId: string;
  chipId: string;
  to: string; // E.164
  text: string; // template ja renderizado, SEM link
}

/** Job: enviar resposta da IA. Core -> Worker. */
export interface OutboundJob {
  conversationId: string;
  leadId: string;
  chipId: string;
  to: string; // E.164
  type: OutboundMsgType;
  /** Texto ja humanizado; pode vir quebrado em baloes (split). */
  parts: string[];
  mediaUrl?: string;
  /** Delay de digitacao por balao (ms) calculado no Core (humanizacao). */
  typingDelaysMs?: number[];
}

/** Evento: mensagem recebida de um lead. Worker -> Core. */
export interface InboundEvent {
  chipId: string;
  from: string; // E.164 do lead
  type: OutboundMsgType;
  content: string;
  mediaUrl?: string;
  waMessageId?: string;
  timestamp: number;
}

/** Sinal de saude inferido pelo worker. Worker -> Core. */
export interface HealthSignalJob {
  chipId: string;
  kind: HealthSignalKind;
  detail?: Record<string, unknown>;
  timestamp: number;
}

export type HealthSignalKind =
  | 'SEND_FAIL'
  | 'NO_DELIVERY'
  | 'NO_READ'
  | 'REPLY_DROP'
  | 'DISCONNECT'
  | 'RECOVERED';
