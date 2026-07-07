import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolEntity } from './entities/rol.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RolEntity)
    private rolesRepository: Repository<RolEntity>,
  ) {}

  async findAll() {
    const roles = await this.rolesRepository.find({
      where: { rol_activo: true },
      order: { rol_nombre: 'ASC' },
    });

    return roles.map((rol) => ({
      rolId: rol.rol_id,
      rolNombre: rol.rol_nombre,
      rolCodigo: rol.rol_codigo,
      rolDescripcion: rol.rol_descripcion,
      activo: rol.rol_activo,
    }));
  }

  async findById(rolId: number) {
    const rol = await this.rolesRepository.findOne({
      where: { rol_id: rolId },
    });

    if (!rol) return null;

    return {
      rolId: rol.rol_id,
      rolNombre: rol.rol_nombre,
      rolCodigo: rol.rol_codigo,
      rolDescripcion: rol.rol_descripcion,
      activo: rol.rol_activo,
    };
  }
}
