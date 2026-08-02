import { IsNumber, IsString, IsOptional, IsPositive } from 'class-validator';

export class CreateAmpliacionCupoDto {
  @IsNumber()
  clienteId: number;

  @IsNumber()
  @IsPositive()
  nuevoCupo: number;

  @IsString()
  justificacion: string;

  @IsNumber()
  @IsPositive()
  consumoMensualProyectado: number;

  @IsNumber()
  @IsPositive()
  toneladasProyectadas: number;

  @IsNumber()
  @IsOptional()
  solicitudAnteriorId?: number;

  @IsNumber()
  @IsOptional()
  cupoActualReferencia?: number;
}
