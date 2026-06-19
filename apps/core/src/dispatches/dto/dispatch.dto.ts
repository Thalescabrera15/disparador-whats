import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDispatchDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  /** Numeros participantes (selecionados pelo nome na UI -> ids aqui). */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  chipIds?: string[];

  /** Permitir {link} na abertura (default false = anti-ban). Decidido por disparo. */
  @IsOptional()
  @IsBoolean()
  allowLinkInOpening?: boolean;
}

export class UpdateDispatchDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  allowLinkInOpening?: boolean;
}

export class SetDispatchChipsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  chipIds!: string[];
}

export class SetDispatchStatusDto {
  @IsIn(['RUNNING', 'PAUSED', 'DONE', 'DRAFT'])
  status!: 'RUNNING' | 'PAUSED' | 'DONE' | 'DRAFT';
}
