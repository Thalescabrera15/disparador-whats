/**
 * Motor de variaveis de template.
 * Sintaxe: {chave} ou {chave|fallback}.
 * Ex: "Oi {nome|cliente}, o {produto} sai por {valor}."
 */

const VAR_RE = /\{([a-zA-Z0-9_]+)(?:\|([^}]*))?\}/g;

export type TemplateContext = Record<string, string | null | undefined>;

/** Renderiza o template substituindo {chave} pelo contexto (ou fallback/vazio). */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(VAR_RE, (_m, key: string, fallback?: string) => {
    const v = ctx[key];
    if (v !== undefined && v !== null && v !== '') return String(v);
    return fallback ?? '';
  });
}

/** Lista as variaveis referenciadas no template (sem duplicar). */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) found.add(m[1]);
  return [...found];
}

/** Variaveis usadas que NAO tem valor no contexto (e nao tem fallback). */
export function missingVariables(
  template: string,
  ctx: TemplateContext,
): string[] {
  const missing = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    const key = m[1];
    const hasFallback = m[2] !== undefined;
    const v = ctx[key];
    if (!hasFallback && (v === undefined || v === null || v === '')) {
      missing.add(key);
    }
  }
  return [...missing];
}

/**
 * Monta o contexto de um lead para renderizar templates.
 * Prioridade (maior primeiro): extras (ex: {link}) > meta do lead (colunas do
 * CSV) > constantes da campanha (flow.variables) > campos derivados (nome...).
 */
export function buildLeadContext(
  lead: { name?: string | null; phone?: string | null; meta?: unknown },
  flowVariables?: unknown,
  extras?: TemplateContext,
): TemplateContext {
  const nome = lead.name?.trim() || '';
  const primeiroNome = nome ? nome.split(/\s+/)[0] : '';

  const flowVars = asStringRecord(flowVariables);
  const leadMeta = asStringRecord(lead.meta);

  return {
    nome,
    primeiro_nome: primeiroNome,
    telefone: lead.phone ?? '',
    ...flowVars,
    ...leadMeta,
    ...(extras ?? {}),
  };
}

function asStringRecord(v: unknown): Record<string, string> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val !== null && val !== undefined) out[k] = String(val);
  }
  return out;
}
