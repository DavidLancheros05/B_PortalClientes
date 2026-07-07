import { IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class AssignModuleDto {
  @IsNumber()
  modId: number;

  @IsOptional()
  @IsBoolean()
  ver?: boolean;

  @IsOptional()
  @IsBoolean()
  crear?: boolean;

  @IsOptional()
  @IsBoolean()
  editar?: boolean;

  @IsOptional()
  @IsBoolean()
  eliminar?: boolean;

  @IsOptional()
  @IsBoolean()
  aprobar?: boolean;
}
