/**
 * Canal de controle de sessao (Core -> Worker) e estado de pareamento
 * (Worker -> Redis -> Core), usados na Fase 2 (Baileys).
 */

export type ControlCommandType = 'PAIR' | 'START' | 'STOP' | 'RETIRE';

export interface ControlCommand {
  type: ControlCommandType;
  chipId: string;
  /** PAIR: usar pairing code (8 digitos) em vez de QR. */
  usePairingCode?: boolean;
}

/** Status de sessao publicado p/ o painel acompanhar o pareamento. */
export type PairStatus =
  | 'INIT'
  | 'PAIRING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'STOPPED';

/** Snapshot do pareamento publicado no Redis (TTL curto; QR rotaciona). */
export interface PairState {
  chipId: string;
  status: PairStatus;
  /** String crua do QR (frontend renderiza). */
  qr?: string;
  /** Pairing code de 8 digitos, se usePairingCode. */
  code?: string;
  updatedAt: number;
}

/** Chave Redis do estado de pareamento de um chip. */
export function chipPairKey(chipId: string): string {
  return `chip:${chipId}:pair`;
}

/** TTL (s) do estado de pareamento no Redis. */
export const PAIR_STATE_TTL_SEC = 120;
