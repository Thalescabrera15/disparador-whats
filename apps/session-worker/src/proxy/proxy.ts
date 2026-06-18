/**
 * Resolucao de proxy por chip. Regra de ouro anti-ban:
 * 1 IP : 1 numero, ESTAVEL. Residencial/movel, regiao casada. Nunca rotacionar.
 */
export interface ProxyConfig {
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  type: string; // "residential" | "mobile"
  region: string; // ex: "BR-SP"
}

/** Monta a URL de proxy (http) p/ alimentar o agent do socket Baileys (Fase 2). */
export function buildProxyUrl(p: ProxyConfig): string {
  const auth =
    p.username && p.password
      ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
      : '';
  return `http://${auth}${p.host}:${p.port}`;
}
