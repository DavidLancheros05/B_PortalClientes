import { PartialType } from '@nestjs/mapped-types';
import { CreateRoleDto } from './create-role.dto';
import { IsOptional, IsArray } from 'class-validator';

export class ModuloPermiso {
  mod_id: number;
  permisos: {
    ver?: boolean;
    crear?: boolean;
    editar?: boolean;
    eliminar?: boolean;
    aprobar?: boolean;
  };
  subModulos?: ModuloPermiso[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @IsOptional()
  @IsArray()
  modulos?: ModuloPermiso[];
}
