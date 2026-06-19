import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenConfig, LlmAdapter, LlmMessage } from './adapters/llm-adapter';
import { QwenAdapter } from './adapters/qwen.adapter';
import { StubAdapter } from './adapters/stub.adapter';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly stub = new StubAdapter();
  private readonly qwen?: QwenAdapter;
  private readonly defaultAdapter: 'stub' | 'qwen';
  private readonly genCfg: GenConfig;

  constructor(private readonly config: ConfigService) {
    this.defaultAdapter = config.get<'stub' | 'qwen'>('AI_ADAPTER', 'stub');
    this.genCfg = {
      temperature: config.get<number>('AI_TEMPERATURE', 0.4),
      maxTokens: config.get<number>('AI_MAX_TOKENS', 400),
    };

    const baseUrl = config.get<string>('QWEN_BASE_URL', '');
    if (baseUrl) {
      this.qwen = new QwenAdapter({
        baseUrl,
        apiKey: config.get<string>('QWEN_API_KEY', ''),
        defaultModel: config.get<string>('QWEN_MODEL', 'qwen2.5-32b-instruct'),
      });
    }
    if (this.defaultAdapter === 'qwen' && !this.qwen) {
      this.logger.warn('AI_ADAPTER=qwen mas QWEN_BASE_URL vazio -> usando stub');
    }
  }

  /**
   * Seleciona o adapter. AI_ADAPTER é o interruptor mestre:
   * 'stub' SEMPRE usa o stub (modo teste/offline); 'qwen' usa a Venice se
   * configurada. Assim ligar/desligar a IA real é só trocar AI_ADAPTER.
   */
  pick(_aiModel?: string): LlmAdapter {
    if (this.defaultAdapter === 'qwen' && this.qwen) return this.qwen;
    return this.stub;
  }

  async generate(
    aiModel: string | undefined,
    messages: LlmMessage[],
    overrides?: Partial<GenConfig>,
  ) {
    const adapter = this.pick(aiModel);
    const text = await adapter.generate(messages, { ...this.genCfg, ...overrides });
    return { text, adapter: adapter.name };
  }
}
