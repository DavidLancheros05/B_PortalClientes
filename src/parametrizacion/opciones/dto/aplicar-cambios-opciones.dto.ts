import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RenombrarOpcionDto {
  @Type(() => Number)
  @IsInt()
  fpo_id: number;

  @IsString()
  @IsNotEmpty()
  fpo_valor: string;
}

// Cambios de opciones que el editor acumula en memoria mientras se edita una
// pregunta y manda juntos al dar "Guardar" (antes cada clic llamaba al
// backend y "Cancelar" no deshacía nada).
export class AplicarCambiosOpcionesDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  crear: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RenombrarOpcionDto)
  renombrar: RenombrarOpcionDto[];

  @IsArray()
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  eliminar: number[];
}
