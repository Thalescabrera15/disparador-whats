import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Criacao de Fluxo (campanha). So `name` e obrigatorio; o resto tem default
 * sensato para o caso simples "disparar templates" (sem produto/checkout).
 */
export class CreateFlowDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  /** Modelo da IA de resposta (default qwen3 sem censura via API). */
  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  knowledgeBase?: string;

  @IsOptional()
  @IsString()
  bridgeDomain?: string;

  @IsOptional()
  @IsString()
  checkoutBaseUrl?: string;

  /** Config de envio opcional: {dailyCapPerChip, window, rampCurve, jitterMs}. */
  @IsOptional()
  @IsObject()
  sendConfig?: Record<string, unknown>;

  /** Constantes de template da campanha, ex: {"valor":"R$ 97"}. */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  aiModel?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  knowledgeBase?: string;

  @IsOptional()
  @IsString()
  checkoutBaseUrl?: string;

  @IsOptional()
  @IsString()
  bridgeDomain?: string;

  /** Constantes de template da campanha (substitui o conjunto atual). */
  @IsOptional()
  @IsObject()
  variables?: Record<string, string>;
}
