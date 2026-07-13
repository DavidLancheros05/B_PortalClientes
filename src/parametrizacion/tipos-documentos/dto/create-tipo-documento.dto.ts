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

  // Encabezado de "formato oficial" (tabla con logo, código de formato y
  // revisión) — solo aplica a documentos con plantilla de texto. Si
  // paginasTotal queda vacío, el PDF se genera con la carta simple de
  // siempre (sin encabezado de tabla).
  @IsOptional()
  @IsString()
  @MaxLength(30)
  formatoCodigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  formatoCodigoSecundario?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  revision?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  paginasTotal?: number;
}
