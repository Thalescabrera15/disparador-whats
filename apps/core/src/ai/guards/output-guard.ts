// Qualquer domínio (multi-rótulo, TLD genérico 2+), http(s):// e www. — SEM allowlist.
const URL_RE =
  /\bhttps?:\/\/\S+|\bwww\.[^\s]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b(?:\/[^\s]*)?/gi;

export interface OutputGuardInput {
  raw: string;
  maxChars: number;
  forbidden: string[];
  recentBot: string[];
}

export interface OutputGuardResult {
  text: string;
  triggered: string[];
  /** false = resposta inútil/insegura -> engine deve regenerar/fallback. */
  ok: boolean;
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Junta links ofuscados: "site ponto com", "bit (.) ly", "x [.] y" -> "site.com". */
function deobfuscate(s: string): string {
  return s.replace(
    /([a-z0-9])\s*(?:\(\s*\.\s*\)|\[\s*\.\s*\]|\bponto\b|\bdot\b)\s*([a-z0-9])/gi,
    '$1.$2',
  );
}

/**
 * Sanitiza a saída do modelo ANTES de enviar. Ordem importa.
 * O link real é injetado pelo CÓDIGO depois (nunca pela IA), então qualquer
 * link na saída da IA é indevido -> regenera (ok=false), não envia mutilado.
 */
export function runOutputGuard(input: OutputGuardInput): OutputGuardResult {
  const triggered: string[] = [];
  const raw = (input.raw ?? '').trim();

  // 1) link (incl. ofuscado) -> regenerar
  const deob = deobfuscate(raw);
  const stripped = deob.replace(URL_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  if (stripped !== deob) {
    triggered.push('link_stripped');
    return { text: stripped, triggered, ok: false };
  }
  let text = raw;

  // 2) overpromise -> regenerar
  const lower = norm(text);
  if (input.forbidden.some((f) => f && lower.includes(norm(f)))) {
    triggered.push('overpromise');
    return { text, triggered, ok: false };
  }

  // 3) vazio/curto demais -> regenerar
  if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 2) {
    triggered.push('empty');
    return { text, triggered, ok: false };
  }

  // 4) anti-repetição -> regenerar
  const n = norm(text);
  if (input.recentBot.some((b) => norm(b) === n)) {
    triggered.push('repeat');
    return { text, triggered, ok: false };
  }

  // 5) limite de tamanho (corta em fronteira de frase) — não bloqueia
  if (input.maxChars && text.length > input.maxChars) {
    triggered.push('truncated');
    const cut = text.slice(0, input.maxChars);
    const lastStop = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('! '),
      cut.lastIndexOf('? '),
    );
    text = (lastStop > 40 ? cut.slice(0, lastStop + 1) : cut).trim();
  }

  return { text, triggered, ok: true };
}
