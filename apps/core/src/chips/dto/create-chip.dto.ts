import { IsOptional, IsString, MaxLength } from 'class-validator';

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
