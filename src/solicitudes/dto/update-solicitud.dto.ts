import { IsOptional, IsNumber, IsString, IsNotEmpty } from 'class-validator';

export class UpdateSolicitudDto {
  @IsOptional()
  @IsNumber()
  sol_consumo_mensual_proyectado?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  observaciones_comercial?: string;

  // agrega otros campos que quieras permitir actualizar
}
