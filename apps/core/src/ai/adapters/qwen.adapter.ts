import { Logger } from '@nestjs/common';
import { GenConfig, LlmAdapter, LlmMessage } from './llm-adapter';

interface QwenOptions {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  timeoutMs?: number;
  retries?: number;
}

/**
 * Adapter Qwen via endpoint OpenAI-compativel (/chat/completions).
 * Serve vLLM/Runpod/OpenRouter/etc. Faz retry com backoff e timeout.
 */
export class QwenAdapter implements LlmAdapter {
  readonly name = 'qwen';
  private readonly logger = new Logger(QwenAdapter.name);

  constructor(private readonly opts: QwenOptions) {
    if (!opts.baseUrl) throw new Error('QWEN_BASE_URL nao configurado');
  }

  async generate(messages: LlmMessage[], cfg: GenConfig): Promise<string> {
    const url = `${this.opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const isVenice = /(^|\.)venice\.ai/i.test(this.opts.baseUrl);
    const body: Record<string, unknown> = {
      model: cfg.model ?? this.opts.defaultModel,
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    };
    if (isVenice) {
      // sem censura = só o NOSSO system prompt; e tira os blocos <think> do Qwen.
      body.venice_parameters = {
        include_venice_system_prompt: false,
        strip_thinking_response: true,
      };
    }
    const retries = this.opts.retries ?? 2;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const t = setTimeout(
        () => controller.abort(),
        this.opts.timeoutMs ?? 30000,
      );
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.opts.apiKey
              ? { Authorization: `Bearer ${this.opts.apiKey}` }
              : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          // 4xx (exceto 429) não é transitório (auth/payment/modelo) -> não re-tenta
          if (res.status >= 400 && res.status < 500 && res.status !== 429) {
            throw Object.assign(new Error(`HTTP ${res.status}: ${detail}`), {
              noRetry: true,
            });
          }
          throw new Error(`HTTP ${res.status}: ${detail}`);
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content?.trim();
        if (!content) throw new Error('resposta do modelo vazia');
        return content;
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          `tentativa ${attempt + 1} falhou: ${(err as Error).message}`,
        );
        if ((err as { noRetry?: boolean })?.noRetry) break; // erro não-transitório
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        }
      } finally {
        clearTimeout(t);
      }
    }
    throw new Error(
      `Qwen indisponivel apos ${retries + 1} tentativas: ${(lastErr as Error)?.message}`,
    );
  }
}
