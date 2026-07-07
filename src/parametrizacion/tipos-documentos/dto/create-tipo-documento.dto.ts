import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTipoDocumentoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcion: string;

  @IsBoolean()
  @Type(() => Boolean)
  obligatorio: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  aplicaFechaEmision: boolean;

  @ValidateIf((o) => o.aplicaFechaEmision === true)
  @IsInt()
  @Min(1)
  @Type(() => Number)
  vigenciaDias?: number;

  @IsBoolean()
  @Type(() => Boolean)
  aplicaZonaFranca: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  estado?: boolean;
}
