import { LlmMessage } from './adapters/llm-adapter';

export interface GuardRules {
  maxChars?: number;
  /** termos proibidos (anti-overpromise): "garantido", "100% certo"... */
  forbidden?: string[];
}

export interface LinkReleaseRule {
  /** so libera link apos N mensagens do lead. */
  minInboundTurns?: number;
  /** palavras de intencao de compra que liberam o link. */
  intentKeywords?: string[];
  /** liberar se o lead pedir explicitamente o link. */
  onRequest?: boolean;
}

export interface FlowAiConfig {
  aiModel?: string;
  systemPrompt?: string;
  knowledgeBase?: string;
  fewShotExamples?: unknown;
  guardRules?: unknown;
  linkReleaseRule?: unknown;
}

export interface TurnRef {
  direction: 'IN' | 'OUT';
  content: string;
}

/** Scaffold do script de VENDA DIRETA (etapas). Sempre presente. */
const SALES_SCAFFOLD = `Você é um vendedor humano conversando por WhatsApp. Conduza a venda em etapas, de forma natural:
1) Acolha e entenda o interesse/dor do lead (qualificar).
2) Conecte o valor do produto à dor dele.
3) Contorne objeções usando APENAS a base de conhecimento abaixo (não invente dados).
4) Quando houver interesse claro, conduza ao fechamento.

Regras inegociáveis:
- Respostas curtas e humanas (1 a 3 frases). Sem textão.
- Nunca prometa o que o produto não entrega. Não invente preço, prazo ou resultado.
- NUNCA envie link a menos que explicitamente autorizado na seção POLÍTICA DE LINK.
- Se o lead pedir para sair/parar, não insista.
- Escreva em PT-BR, tom próximo, sem parecer robô e sem repetir frases anteriores.`;

export function parseFewShot(raw: unknown): LlmMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: LlmMessage[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      'role' in item &&
      'content' in item &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string'
    ) {
      out.push({ role: item.role, content: item.content });
    }
  }
  return out;
}

function guardDirectives(rules: GuardRules): string {
  const lines: string[] = [];
  if (rules.maxChars) {
    lines.push(`- Limite cada mensagem a ~${rules.maxChars} caracteres.`);
  }
  if (rules.forbidden?.length) {
    lines.push(`- Nunca use estes termos: ${rules.forbidden.join(', ')}.`);
  }
  return lines.length ? `\nRESTRIÇÕES EXTRAS:\n${lines.join('\n')}` : '';
}

function linkPolicy(allowed: boolean): string {
  return allowed
    ? '\nPOLÍTICA DE LINK: você está autorizado a conduzir ao fechamento agora. NÃO escreva a URL você mesmo — apenas sinalize que vai enviar o link; o sistema injeta o link correto.'
    : '\nPOLÍTICA DE LINK: NÃO envie nenhum link agora. Foque em despertar interesse e tratar objeções.';
}

export function asGuardRules(raw: unknown): GuardRules {
  return raw && typeof raw === 'object' ? (raw as GuardRules) : {};
}

export function asLinkRule(raw: unknown): LinkReleaseRule {
  const r = raw && typeof raw === 'object' ? (raw as LinkReleaseRule) : {};
  return {
    minInboundTurns: r.minInboundTurns ?? 2,
    intentKeywords: r.intentKeywords ?? [
      'quero',
      'comprar',
      'como compro',
      'me manda',
      'preço',
      'link',
      'fechar',
    ],
    onRequest: r.onRequest ?? true,
  };
}

/** Monta as mensagens p/ o modelo. linkAllowed e decidido pelo engine (código). */
export function buildMessages(params: {
  flow: FlowAiConfig;
  summary?: string | null;
  history: TurnRef[];
  incoming: string;
  linkAllowed: boolean;
  recentTurns: number;
}): LlmMessage[] {
  const { flow, summary, history, incoming, linkAllowed, recentTurns } = params;

  const systemParts = [
    SALES_SCAFFOLD,
    flow.systemPrompt?.trim()
      ? `\nPERSONA/OBJETIVO DO PRODUTO:\n${flow.systemPrompt.trim()}`
      : '',
    flow.knowledgeBase?.trim()
      ? `\nBASE DE CONHECIMENTO (única fonte de fatos):\n${flow.knowledgeBase.trim()}`
      : '',
    guardDirectives(asGuardRules(flow.guardRules)),
    linkPolicy(linkAllowed),
  ].filter(Boolean);

  const messages: LlmMessage[] = [
    { role: 'system', content: systemParts.join('\n') },
    ...parseFewShot(flow.fewShotExamples),
  ];

  if (summary?.trim()) {
    messages.push({
      role: 'system',
      content: `Resumo da conversa até agora: ${summary.trim()}`,
    });
  }

  for (const turn of history.slice(-recentTurns)) {
    messages.push({
      role: turn.direction === 'IN' ? 'user' : 'assistant',
      content: turn.content,
    });
  }

  messages.push({ role: 'user', content: incoming });
  return messages;
}
