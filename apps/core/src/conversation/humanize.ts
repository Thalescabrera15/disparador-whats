/** Quebra a resposta em 1-3 balões naturais (split por frases). */
export function splitMessage(text: string, maxParts = 3): string[] {
  const t = text.trim();
  if (t.length <= 140) return [t];

  const sentences =
    t.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g)?.map((s) => s.trim()).filter(Boolean) ??
    [t];
  if (sentences.length <= 1) return [t];

  // agrupa frases em até maxParts blocos aproximadamente equilibrados
  const perPart = Math.ceil(sentences.length / maxParts);
  const parts: string[] = [];
  for (let i = 0; i < sentences.length; i += perPart) {
    parts.push(sentences.slice(i, i + perPart).join(' '));
  }
  return parts.slice(0, maxParts);
}

/** Delay de digitação por balão, proporcional ao tamanho + jitter (humano). */
export function typingDelays(parts: string[]): number[] {
  return parts.map((p) => {
    const base = Math.min(Math.max(p.length * 45, 1200), 7000);
    return base + 400 + Math.floor(Math.random() * 1200);
  });
}
