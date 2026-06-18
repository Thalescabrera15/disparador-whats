import type { HealthSignalKind } from './queues';

/**
 * Pesos padrao de impacto no healthScore (0-100) por tipo de sinal.
 * Valores negativos derrubam o score; positivos recuperam.
 * Calibre na pratica - REPLY_DROP e SEND_FAIL sao os mais letais
 * (proxies fortes de block/mute do destinatario).
 */
export const HEALTH_SIGNAL_WEIGHTS: Record<HealthSignalKind, number> = {
  SEND_FAIL: -12,
  NO_DELIVERY: -6,
  NO_READ: -4,
  REPLY_DROP: -15,
  DISCONNECT: -5,
  RECOVERED: +8,
};

/** Faixas de score que disparam politica no Health Monitor. */
export const HEALTH_THRESHOLDS = {
  /** >= SOFT: opera normal. < SOFT: desce a rampa (reduz dailyCap). */
  SOFT: 70,
  /** < COOLDOWN: pausa temporaria. */
  COOLDOWN: 50,
  /** < RETIRE (ou consecFails alto): aposenta o chip. */
  RETIRE: 30,
} as const;

/** Falhas consecutivas que forcam aposentadoria, independente do score. */
export const MAX_CONSEC_FAILS = 5;
