import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

// Orden completo de las preguntas de una sección, tal como quedó en el
// editor: fp_ids[0] pasa a fp_orden = 1, fp_ids[1] a 2, etc.
export class ReordenarPreguntasDto {
  @Type(() => Number)
  @IsInt()
  fs_id: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @Type(() => Number)
  @IsInt({ each: true })
  fp_ids: number[];
}
