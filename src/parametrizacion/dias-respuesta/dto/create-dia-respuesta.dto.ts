import { IsIn, IsInt, Min } from 'class-validator';

export class CreateDiaRespuestaDto {
  @IsIn(['COMERCIAL', 'FINANCIERA'])
  pdr_area: 'COMERCIAL' | 'FINANCIERA';

  @IsInt()
  @Min(1)
  pdr_dias: number;
}
