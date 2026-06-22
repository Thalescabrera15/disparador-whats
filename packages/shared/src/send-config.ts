/** Config de envio opcional no Flow.sendConfig (sobrescreve defaults globais). */
export interface FlowSendConfig {
  dailyCapPerChip?: number;
  window?: { start?: number; end?: number };
  rampCurve?: number[];
  jitterMs?: { min?: number; max?: number };
}

export function parseSendConfig(raw: unknown): FlowSendConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const cfg: FlowSendConfig = {};
  if (typeof o.dailyCapPerChip === 'number' && o.dailyCapPerChip > 0) {
    cfg.dailyCapPerChip = o.dailyCapPerChip;
  }
  if (o.window && typeof o.window === 'object') {
    const w = o.window as Record<string, unknown>;
    cfg.window = {
      start: typeof w.start === 'number' ? w.start : undefined,
      end: typeof w.end === 'number' ? w.end : undefined,
    };
  }
  if (Array.isArray(o.rampCurve)) {
    const curve = o.rampCurve
      .map((n) => (typeof n === 'number' ? n : parseInt(String(n), 10)))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (curve.length) cfg.rampCurve = curve;
  }
  if (o.jitterMs && typeof o.jitterMs === 'object') {
    const j = o.jitterMs as Record<string, unknown>;
    cfg.jitterMs = {
      min: typeof j.min === 'number' ? j.min : undefined,
      max: typeof j.max === 'number' ? j.max : undefined,
    };
  }
  return cfg;
}

/** Fator de jitter individual por chip (0.75–1.35). Evita frota em uníssono. */
export function perChipFactor(chipId: string): number {
  let h = 0;
  for (let i = 0; i < chipId.length; i++) {
    h = (h * 31 + chipId.charCodeAt(i)) | 0;
  }
  const norm = (Math.abs(h) % 1000) / 1000;
  return 0.75 + norm * 0.6;
}
