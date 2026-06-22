import { IsOptional, IsString, MaxLength, IsInt, Min, Max, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateChipDto {
  @IsString()
  label!: string;

  /** Telefone do chip (sera normalizado p/ E.164). */
  @IsString()
  phone!: string;

  /** Proxy estavel a ligar no chip (regiao deve casar). */
  @IsOptional()
  @IsString()
  proxyId?: string;
}

export class PairChipDto {
  /** Parear por codigo de 8 digitos em vez de QR. */
  @IsOptional()
  usePairingCode?: boolean;
}

export class BindProxyDto {
  @IsString()
  proxyId!: string;
}

export class RenameChipDto {
  @IsString()
  @MaxLength(60)
  label!: string;
}

/** Config anti-ban por chip: janela comercial, dias de descanso, rampa. */
export class UpdateChipConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  windowStart?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  windowEnd?: number;

  /** Dias de descanso (0=Dom .. 6=Sab, fuso SCHEDULER_TZ). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  restDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  rampDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyCap?: number;
}
