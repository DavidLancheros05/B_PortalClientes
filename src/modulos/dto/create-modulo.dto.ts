import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  MinLength,
} from 'class-validator';

export class CreateModuloDto {
  @IsString()
  @MinLength(1)
  nombre: string;

  @IsOptional()
  @IsString()
  ruta?: string;

  @IsOptional()
  @IsString()
  icono?: string;

  @IsOptional()
  @IsNumber()
  orden?: number;

  @IsOptional()
  @IsNumber()
  padre_id?: number;

  @IsOptional()
  @IsBoolean()
  es_categoria?: boolean;
}
