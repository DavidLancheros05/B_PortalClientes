import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioRolEntity } from './entities/usuario-rol.entity';
import { UsuarioEntity } from '../usuarios/entities/usuario.entity';
import { RolEntity } from '../roles/entities/rol.entity';

@Injectable()
export class UsuarioRolesService {
  constructor(
    @InjectRepository(UsuarioRolEntity)
    private usuarioRolRepository: Repository<UsuarioRolEntity>,
    @InjectRepository(UsuarioEntity)
    private usuarioRepository: Repository<UsuarioEntity>,
    @InjectRepository(RolEntity)
    private rolRepository: Repository<RolEntity>,
  ) {}

  async getAllUsuarios() {
    const usuarios = await this.usuarioRepository.find({
      where: { usr_inactivar: false },
      order: { usr_nombre: 'ASC' },
    });

    return usuarios.map((u) => ({
      usr_id: u.usr_id,
      usr_nombre: u.usr_nombre,
      usr_correo: u.usr_correo,
    }));
  }

  async getByUsuario(usuarioId: number) {
    const usuarioRoles = await this.usuarioRolRepository.find({
      where: { ur_usuario_id: usuarioId, ur_activo: true },
      relations: ['rol'],
    });

    return usuarioRoles.map((ur) => ({
      usuarioId: ur.ur_usuario_id,
      rolId: ur.ur_rol_id,
      rolNombre: ur.rol.rol_nombre,
      rolCodigo: ur.rol.rol_codigo,
    }));
  }

  async assignRole(usuarioId: number, rolId: number) {
    const usuario = await this.usuarioRepository.findOne({
      where: { usr_id: usuarioId },
    });
    if (!usuario) throw new BadRequestException('Usuario no encontrado');

    const rol = await this.rolRepository.findOne({
      where: { rol_id: rolId },
    });
    if (!rol) throw new BadRequestException('Rol no encontrado');

    const existente = await this.usuarioRolRepository.findOne({
      where: { ur_usuario_id: usuarioId, ur_rol_id: rolId },
    });

    if (existente) {
      if (existente.ur_activo) {
        throw new BadRequestException('El rol ya está asignado al usuario');
      }
      existente.ur_activo = true;
      existente.ur_updated_at = new Date();
      await this.usuarioRolRepository.save(existente);
    } else {
      const nuevoRol = this.usuarioRolRepository.create({
        ur_usuario_id: usuarioId,
        ur_rol_id: rolId,
        ur_activo: true,
        ur_created_at: new Date(),
      });
      await this.usuarioRolRepository.save(nuevoRol);
    }

    return { message: 'Rol asignado correctamente' };
  }

  async removeRole(usuarioId: number, rolId: number) {
    const usuarioRol = await this.usuarioRolRepository.findOne({
      where: { ur_usuario_id: usuarioId, ur_rol_id: rolId },
    });

    if (!usuarioRol) {
      throw new BadRequestException('El rol no está asignado al usuario');
    }

    usuarioRol.ur_activo = false;
    usuarioRol.ur_updated_at = new Date();
    await this.usuarioRolRepository.save(usuarioRol);

    return { message: 'Rol removido correctamente' };
  }
}
