import {
  IsEnum,
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';
import { TipoPregunta } from '../entities/formulario-pregunta.entity';

export class CreateFormularioPreguntaDto {
  @IsOptional()
  @IsInt()
  fp_id?: number;

  @IsOptional()
  @IsString()
  fp_descripcion?: string;

  @IsOptional()
  @IsString()
  fp_codigo?: string | null;

  @IsOptional()
  @IsEnum(TipoPregunta)
  fp_tipo?: TipoPregunta;

  @IsOptional()
  @IsInt()
  fp_orden?: number;

  @IsOptional()
  @IsInt()
  fp_version?: number;

  @IsOptional()
  @IsBoolean()
  fp_estado?: boolean;

  @IsOptional()
  @IsString()
  fp_precarga_fuente?: string | null;

  @IsOptional()
  @IsString()
  fp_precarga_campo_cliente?: string | null;

  @IsOptional()
  @IsInt()
  formulario_id?: number | null;

  @IsOptional()
  @IsInt()
  seccion_id?: number | null;

  @IsOptional()
  @IsBoolean()
  fp_requerida?: boolean;

  @IsOptional()
  @IsInt()
  fp_minimo?: number | null;

  @IsOptional()
  @IsInt()
  fp_maximo?: number | null;

  @IsOptional()
  @IsString()
  fp_subtipo?: string | null;

  @IsOptional()
  @IsString()
  fp_patron?: string | null;

  @IsOptional()
  @IsString()
  fp_catalogo_base_datos?: string | null;

  @IsOptional()
  @IsString()
  fp_catalogo_tabla?: string | null;

  @IsOptional()
  @IsString()
  fp_catalogo_columna?: string | null;

  @IsOptional()
  @IsString()
  fp_catalogo_pk_column?: string | null;

  @IsOptional()
  @IsInt()
  fp_tipo_documento_id?: number | null;

  @IsOptional()
  @IsInt()
  fp_pregunta_padre_id?: number | null;

  @IsOptional()
  @IsString()
  fp_valor_padre_disparador?: string | null;

  @IsOptional()
  @IsString()
  fp_tabla_columnas?: string | null;

  @IsOptional()
  @IsBoolean()
  fp_ancho_completo?: boolean;
}
