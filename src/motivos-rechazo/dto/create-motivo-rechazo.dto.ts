import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class CreateMotivoRechazoDto {
  @IsNotEmpty({ message: 'La descripción es requerida' })
  @IsString({ message: 'La descripción debe ser un texto' })
  @MinLength(3, { message: 'La descripción debe tener al menos 3 caracteres' })
  @MaxLength(500, { message: 'La descripción no puede exceder 500 caracteres' })
  descripcion: string;
}
