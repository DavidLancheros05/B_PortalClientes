import { IsInt, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFormularioPreguntaOpcionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fpo_fp_id?: number;

  @IsNotEmpty()
  fpo_valor: string;

  @IsOptional()
  @IsBoolean()
  fpo_estado?: boolean;
}
