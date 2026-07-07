import { IsString, IsOptional, IsNumber, MinLength } from 'class-validator';

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
}
