import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateRoleDto {
  @IsString()
  @MaxLength(50)
  @Transform(({ value, obj }) => value || obj.rol_nombre)
  rolNombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value, obj }) => value || obj.rol_descripcion)
  rolDescripcion?: string;

  @IsString()
  @MaxLength(50)
  @Transform(({ value, obj }) => value || obj.rol_codigo)
  rolCodigo: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value, obj }) => value ?? obj.rol_activo)
  rolActivo?: boolean;
}
