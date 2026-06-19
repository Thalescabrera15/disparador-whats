import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateProxyDto {
  @IsString()
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsIn(['residential', 'mobile'])
  type!: string;

  /** ex: "BR" ou "BR-SP" (pais obrigatorio; deve casar com o numero). */
  @IsString()
  @Matches(/^[A-Z]{2}(-[A-Z0-9]+)?$/i, {
    message: 'region deve ser tipo "BR" ou "BR-SP"',
  })
  region!: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
