// src/solicitudes/dto/create-solicitud.dto.ts
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ValidateNested,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RespuestaDto {
  @IsInt()
  @IsNotEmpty()
  fp_id: number;

  @IsOptional()
  @IsString()
  valor_texto?: string;

  @IsOptional()
  @IsNumber()
  valor_numero?: number;

  @IsOptional()
  @IsString()
  valor_fecha?: string; // formato 'YYYY-MM-DD'

  @IsOptional()
  @IsInt()
  valor_opcion_id?: number;
}

export class CreateSolicitudDto {
  // ===== Cliente =====
  @IsInt()
  @IsNotEmpty()
  sol_cliente_id: number;

  @IsString()
  @IsOptional()
  sol_razon_social?: string;

  @IsString()
  @IsOptional()
  sol_nit_documento?: string;

  @IsString()
  @IsOptional()
  sol_direccion?: string;

  @IsString()
  @IsOptional()
  sol_telefono?: string;

  // ===== Centro de operación =====
  @IsInt()
  @IsNotEmpty()
  sol_co_id: number;

  // ===== Datos de la solicitud =====
  @IsNumber()
  @IsOptional()
  @Min(0)
  sol_consumo_mensual_proyectado?: number;

  @IsString()
  @IsOptional()
  observaciones_comercial?: string;

  // ===== Estado =====
  @IsInt()
  @IsOptional()
  sol_estado_id?: number; // si no se envía, se asigna por defecto en el servicio

  // ===== Usuario que crea =====
  @IsInt()
  @IsOptional()
  sol_usuario_crea?: number; // se puede tomar del token

  // ===== Respuestas del formulario =====
  @ValidateNested({ each: true })
  @Type(() => RespuestaDto)
  @ArrayNotEmpty()
  respuestas: RespuestaDto[];
}
