import {
  IsString,
  IsEmail,
  IsBoolean,
  IsNumber,
  IsArray,
  IsOptional,
} from 'class-validator';

export class UpdateClienteDto {
  @IsString()
  @IsOptional()
  cli_razon_social?: string;

  @IsString()
  @IsOptional()
  cli_nro_identificacion?: string;

  @IsNumber()
  @IsOptional()
  cli_tipo_identificacion?: number | null;

  @IsString()
  @IsOptional()
  cli_direccion?: string;

  @IsEmail()
  @IsOptional()
  cli_correo?: string;

  @IsBoolean()
  @IsOptional()
  cli_acceso_portal_clientes?: boolean;

  @IsNumber()
  @IsOptional()
  ejng_id?: number | null;

  @IsNumber()
  @IsOptional()
  pai_id?: number;

  @IsNumber()
  @IsOptional()
  dpto_id?: number;

  @IsNumber()
  @IsOptional()
  ciu_id?: number;

  @IsArray()
  @IsOptional()
  centro_operacion_ids?: number[];
}
