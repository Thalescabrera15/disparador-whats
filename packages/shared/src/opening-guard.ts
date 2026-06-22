/** Verifica se o template de abertura convida o lead a responder. */
export function invitesReply(template: string): boolean {
  const t = template.trim();
  if (!t) return false;
  if (/\?/.test(t)) return true;
  const patterns = [
    /\b(pode|podia|consegue|quer|gostaria|topa|me (diz|fala|conta|responde|manda|envia))\b/i,
    /\b(o que acha|como (ficou|esta|está)|me avisa|me fala|me conta)\b/i,
    /\b(tudo bem|tudo certo|beleza|ok pra)\b/i,
    /\b(responde|responda|manda um|da um retorno)\b/i,
  ];
  return patterns.some((p) => p.test(t));
}
