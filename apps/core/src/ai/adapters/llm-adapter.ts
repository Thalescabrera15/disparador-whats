export type LlmRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface GenConfig {
  temperature: number;
  maxTokens: number;
  /** modelo a usar (sobrescreve o default do adapter). */
  model?: string;
}

/** Contrato comum dos modelos. Troca de modelo = troca de adapter. */
export interface LlmAdapter {
  readonly name: string;
  generate(messages: LlmMessage[], cfg: GenConfig): Promise<string>;
}
