import { IsNumber, IsString, IsOptional } from 'class-validator';

export class CreateAmpliacionCupoDto {
  @IsNumber()
  clienteId: number;

  @IsNumber()
  nuevoCupo: number;

  @IsString()
  justificacion: string;

  @IsNumber()
  @IsOptional()
  solicitudAnteriorId?: number;
}
