import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsBoolean,
  IsNumber,
  IsArray,
  IsOptional,
} from 'class-validator';

export class CreateClienteDto {
  @IsString()
  @IsNotEmpty()
  cli_razon_social: string;

  @IsString()
  @IsNotEmpty()
  cli_nro_identificacion: string;

  @IsNumber()
  cli_tipo_identificacion: number;

  @IsString()
  cli_direccion: string;

  @IsEmail()
  @IsOptional()
  cli_correo?: string;

  @IsBoolean()
  @IsOptional()
  cli_acceso_portal_clientes?: boolean;

  @IsNumber()
  ejng_id: number;

  @IsNumber()
  pai_id: number;

  @IsNumber()
  dpto_id: number;

  @IsNumber()
  ciu_id: number;

  @IsArray()
  centro_operacion_ids: number[];
}
