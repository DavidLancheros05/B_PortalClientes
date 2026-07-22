import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTipoDocumentoRevisionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tipoDocumentoId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  revision: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcionCambio: string;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  orden?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  estado?: boolean;
}
