import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class PreviewConversationDto {
  /** Mensagem simulada do lead. */
  @IsString()
  @MinLength(1)
  incoming!: string;

  /** Renderiza contra um lead/conversa real (carrega histórico). */
  @IsOptional()
  @IsString()
  leadId?: string;

  /** Histórico ad-hoc: [{direction:'IN'|'OUT', content}]. */
  @IsOptional()
  @IsArray()
  history?: { direction: 'IN' | 'OUT'; content: string }[];
}
