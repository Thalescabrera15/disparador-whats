function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Detecta pedido de opt-out com ALTA precisão (suprimir é global e permanente):
 * - palavra inteira (não substring)
 * - guarda de negação ("nao vou parar", "nunca sair" NÃO contam)
 * - palavra-chave ambígua de 1 token só conta em mensagem curta (<=5 palavras)
 *   -> "nao vou parar de usar isso" (6 palavras) não dispara.
 */
export function detectOptOut(text: string, keywords: string[]): boolean {
  const t = norm(text);
  const wordCount = t.split(/\s+/).filter(Boolean).length;

  for (const kw of keywords) {
    const k = norm(kw);
    if (!k) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRe(k)}([^a-z0-9]|$)`);
    const m = re.exec(t);
    if (!m) continue;

    // negação imediatamente antes? ("nao parar", "nunca quero sair")
    const before = t.slice(0, m.index).trim().split(/\s+/).slice(-3).join(' ');
    if (/\b(nao|nunca|jamais|sem)\b/.test(before)) continue;

    // termo de 1 token (sair/parar/pare) só conta em mensagem curta
    const isSingleToken = !k.includes(' ');
    if (isSingleToken && wordCount > 5) continue;

    return true;
  }
  return false;
}

/** Heurística simples de prompt-injection / tentativa de sequestrar a IA. */
export function detectInjection(text: string): boolean {
  const t = norm(text);
  return [
    'ignore as instrucoes',
    'ignore previous',
    'voce agora e',
    'you are now',
    'system prompt',
    'aja como',
    'esqueca as regras',
  ].some((p) => t.includes(p));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
