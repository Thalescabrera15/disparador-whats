import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOpeningMessageDto {
  /** Template da abertura. Pede resposta. SEM link. Suporta {nome}. */
  @IsString()
  @MinLength(1)
  template!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PreviewTemplateDto {
  @IsString()
  @MinLength(1)
  template!: string;

  /** Renderiza contra este lead (senao usa o primeiro do fluxo ou um exemplo). */
  @IsOptional()
  @IsString()
  leadId?: string;

  /** Valores ad-hoc p/ testar variaveis sem precisar de coluna (ex: {valor}). */
  @IsOptional()
  @IsObject()
  sample?: Record<string, string>;
}

export class UpdateOpeningMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  template?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
