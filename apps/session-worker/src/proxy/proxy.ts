import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { Agent } from 'node:https';

/**
 * Resolucao de proxy por chip. Regra de ouro anti-ban:
 * 1 IP : 1 numero, ESTAVEL. Residencial/movel, regiao casada. Nunca rotacionar.
 * O proxy e ligado ANTES do registro/connect e e o mesmo pra sempre.
 */
export interface ProxyConfig {
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
  type: string; // "residential" | "mobile" (tipo de rede)
  region: string; // ex: "BR-SP"
  /** Protocolo do proxy. Default http (maioria dos residenciais). */
  protocol?: 'http' | 'socks5' | null;
}

/** Monta a URL do proxy (com auth, se houver). */
export function buildProxyUrl(p: ProxyConfig): string {
  const scheme = p.protocol === 'socks5' ? 'socks5' : 'http';
  const auth =
    p.username && p.password
      ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
      : '';
  return `${scheme}://${auth}${p.host}:${p.port}`;
}

/** Cria o agent p/ alimentar o socket Baileys (campo `agent`/`fetchAgent`). */
export function buildProxyAgent(p: ProxyConfig): Agent {
  const url = buildProxyUrl(p);
  return p.protocol === 'socks5'
    ? (new SocksProxyAgent(url) as unknown as Agent)
    : (new HttpsProxyAgent(url) as unknown as Agent);
}

/**
 * Valida que a regiao do proxy casa com a do numero (mesmo pais; idealmente UF).
 * Mismatch e flag anti-ban -> recusar o bind.
 */
export function regionMatches(numberRegion: string, proxyRegion: string): boolean {
  if (!numberRegion || !proxyRegion) return false;
  const country = (r: string) => r.split('-')[0]?.toUpperCase();
  return country(numberRegion) === country(proxyRegion);
}
