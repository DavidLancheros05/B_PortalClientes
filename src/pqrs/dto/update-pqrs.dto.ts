import { IsString, IsNumber, IsOptional } from 'class-validator';

export class UpdatePQRSDto {
  @IsString()
  @IsOptional()
  pqrs_titulo?: string;

  @IsString()
  @IsOptional()
  pqrs_descripcion?: string;

  @IsNumber()
  @IsOptional()
  pqrs_pe_id?: number;

  @IsNumber()
  @IsOptional()
  pqrs_pri_id?: number;
}
