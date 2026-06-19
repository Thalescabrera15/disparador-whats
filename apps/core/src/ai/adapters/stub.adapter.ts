import { GenConfig, LlmAdapter, LlmMessage } from './llm-adapter';

/**
 * Adapter deterministico (sem rede). Usado no dry-run/testes e como default
 * ate o Qwen estar configurado. NAO inventa link (o gate de link e do codigo).
 * Gera uma resposta de vendas curta e coerente com a ultima mensagem do lead.
 */
export class StubAdapter implements LlmAdapter {
  readonly name = 'stub';

  async generate(messages: LlmMessage[], _cfg: GenConfig): Promise<string> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const text = (lastUser?.content ?? '').toLowerCase();

    if (/(caro|preç|valor|quanto)/.test(text)) {
      return 'Entendo a preocupação com o valor. Pelo que ele entrega, costuma se pagar rápido. Quer que eu te explique como funciona a garantia?';
    }
    if (/(funciona|serve|resultado|garantia)/.test(text)) {
      return 'Funciona sim, e você tem garantia. Posso te mostrar o passo a passo pra você decidir com tranquilidade?';
    }
    if (/(quero|comprar|como faço|me manda|interess)/.test(text)) {
      return 'Perfeito, fico feliz com o interesse! Já te passo os detalhes pra garantir.';
    }
    return 'Massa! Me conta rapidinho: o que mais pesa pra você decidir hoje?';
  }
}
