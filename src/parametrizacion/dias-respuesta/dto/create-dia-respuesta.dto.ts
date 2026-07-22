import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateDiaRespuestaDto {
  @IsString()
  @IsNotEmpty()
  pdr_area: string;

  @IsInt()
  @Min(1)
  pdr_dias: number;
}
