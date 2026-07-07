import { IsNumber, IsString, IsOptional } from 'class-validator';

export class UpdateAmpliacionCupoDto {
  @IsNumber()
  @IsOptional()
  clienteId?: number;

  @IsNumber()
  @IsOptional()
  nuevoCupo?: number;

  @IsString()
  @IsOptional()
  justificacion?: string;

  @IsNumber()
  @IsOptional()
  solicitudAnteriorId?: number;
}
