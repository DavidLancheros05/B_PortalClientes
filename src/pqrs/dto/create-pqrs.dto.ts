import {
  IsString,
  IsNumber,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePQRSDto {
  @IsNumber()
  pqrs_pt_id: number;

  @IsString()
  @MinLength(5)
  @MaxLength(255)
  pqrs_titulo: string;

  @IsString()
  @MinLength(10)
  pqrs_descripcion: string;

  @IsNumber()
  @IsOptional()
  pqrs_pri_id?: number;

  @IsNumber()
  @IsOptional()
  pqrs_cli_id?: number;
}
