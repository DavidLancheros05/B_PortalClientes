import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateComentarioDto {
  @IsString()
  pc_comentario: string;

  @IsBoolean()
  @IsOptional()
  pc_es_interno?: boolean;
}
