import { z } from 'zod';

/**
 * Validacao do ambiente no boot. Falha rapido se algo critico faltar.
 * Coerce em numeros porque process.env e sempre string.
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  CORE_PORT: z.coerce.number().int().positive().default(3000),

  // Infra (Railway)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL e obrigatorio'),
  REDIS_URL: z.string().min(1, 'REDIS_URL e obrigatorio'),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter >= 16 chars'),
  JWT_EXPIRES_IN: z.string().default('12h'),

  // Dev: permite parear sem proxy (NUNCA usar em producao - anti-ban exige proxy).
  ALLOW_PAIR_WITHOUT_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Base publica do bridge de links (fallback quando o fluxo nao tem bridgeDomain).
  // ex: "https://meu-dominio-ponte.com". Vazio = usa flow.bridgeDomain ou checkout direto.
  PUBLIC_BASE_URL: z.string().optional().default(''),

  // LLM (opcionais no boot - validados quando um Fluxo os usar)
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  QWEN_BASE_URL: z.string().optional().default(''),
  QWEN_API_KEY: z.string().optional().default(''),
  QWEN_MODEL: z.string().optional().default('qwen2.5-32b-instruct'),
  WHISPER_URL: z.string().optional().default(''),
  ELEVENLABS_API_KEY: z.string().optional().default(''),

  // Conversational Engine
  // adapter default 'stub' (deterministico) ate o Qwen estar configurado.
  AI_ADAPTER: z.enum(['stub', 'qwen']).default('stub'),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  AI_MAX_TOKENS: z.coerce.number().int().positive().default(400),
  AI_RECENT_TURNS: z.coerce.number().int().positive().default(10),
  AI_SUMMARY_EVERY: z.coerce.number().int().positive().default(8),

  // Storage
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY: z.string().optional().default(''),
  R2_SECRET: z.string().optional().default(''),
  R2_BUCKET: z.string().optional().default(''),

  // Defaults de envio / anti-ban
  DEFAULT_DAILY_CAP: z.coerce.number().int().positive().default(55),
  DEFAULT_WINDOW_START: z.coerce.number().int().min(0).max(23).default(9),
  DEFAULT_WINDOW_END: z.coerce.number().int().min(1).max(24).default(20),
  RAMP_CURVE: z.string().default('5,8,15,25,35,45,55'),
  JITTER_MIN_MS: z.coerce.number().int().nonnegative().default(45000),
  JITTER_MAX_MS: z.coerce.number().int().nonnegative().default(180000),

  // Scheduler (motor de disparo)
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  SCHEDULER_TICK_MS: z.coerce.number().int().positive().default(15000),
  // Fuso da janela comercial (servidor pode rodar em UTC, ex: Railway).
  SCHEDULER_TZ: z.string().default('America/Sao_Paulo'),
  OPTOUT_KEYWORDS: z
    .string()
    .default(
      'descadastrar,sair,parar,pare,nao quero receber,nao quero mais,para de me mandar,pare de me mandar,para de enviar,pare de enviar,remover,cancelar,stop,unsubscribe',
    ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuracao de ambiente invalida:\n${issues}`);
  }
  return parsed.data;
}
