import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateRespuestaDto {
  @IsNumber()
  fpId: number;

  @IsOptional()
  @IsString()
  valorTexto?: string;

  @IsOptional()
  @IsNumber()
  valorNumero?: number;

  @IsOptional()
  valorFecha?: Date;

  @IsOptional()
  @IsNumber()
  valorOpcionId?: number;
}
