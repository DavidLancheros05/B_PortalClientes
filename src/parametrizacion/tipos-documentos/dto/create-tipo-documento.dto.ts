import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
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

  @ValidateIf(
    (o) => o.aplicaFechaEmision === true && o.reglaVigencia === 'DIAS',
  )
  @IsInt()
  @Min(1)
  @Type(() => Number)
  vigenciaDias?: number;

  @IsOptional()
  @IsString()
  reglaVigencia?: string;

  @ValidateIf(
    (o) => o.aplicaFechaEmision === true && o.reglaVigencia === 'ANIO',
  )
  @IsInt()
  @Min(0)
  @Type(() => Number)
  aniosAtrasPermitidos?: number;

  @IsBoolean()
  @Type(() => Boolean)
  aplicaZonaFranca: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  estado?: boolean;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  tienePlantilla?: boolean;

  @IsOptional()
  @IsIn(['TEXTO', 'PDF_SOLICITUD'])
  tipoPlantilla?: 'TEXTO' | 'PDF_SOLICITUD';

  @ValidateIf(
    (o) => o.tienePlantilla === true && o.tipoPlantilla !== 'PDF_SOLICITUD',
  )
  @IsString()
  @IsNotEmpty()
  plantillaContenido?: string;
}
