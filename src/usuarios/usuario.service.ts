import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioEntity } from './entities/usuario.entity';
import { UsuariosCentrosEntity } from './entities/usuarios-centros.entity';
import { CentroOperacionEntity } from '../centros-operacion/entities/centro-operacion.entity';
import * as bcrypt from 'bcrypt';
import {
  AssignCentroDto,
  AssignMultipleCentrosDto,
} from './dto/assign-centro.dto';

@Injectable()
export class UsuarioService {
  constructor(
    @InjectRepository(UsuarioEntity)
    private usuarioRepository: Repository<UsuarioEntity>,
    @InjectRepository(UsuariosCentrosEntity)
    private usuariosCentrosRepository: Repository<UsuariosCentrosEntity>,
    @InjectRepository(CentroOperacionEntity)
    private centrosRepository: Repository<CentroOperacionEntity>,
  ) {}

  async findByEmail(email: string): Promise<UsuarioEntity | null> {
    const user = await this.usuarioRepository.findOne({
      where: { usr_correo: email },
    });
    return user;
  }

  async validatePassword(
    user: UsuarioEntity,
    password: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, user.usr_password);
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.usuarioRepository.findOne({
      where: { usr_id: userId },
    });
    if (!user) throw new Error('Usuario no encontrado');

    const valid = await this.validatePassword(user, currentPassword);
    if (!valid) throw new Error('Contraseña actual incorrecta');

    const salt = await bcrypt.genSalt(10);
    user.usr_password = await bcrypt.hash(newPassword, salt);

    await this.usuarioRepository.save(user);
    return { message: 'Contraseña actualizada correctamente' };
  }

  // 🔹 Nuevo método para obtener usuario por id
  async findById(userId: number): Promise<UsuarioEntity> {
    const user = await this.usuarioRepository.findOne({
      where: { usr_id: userId },
      relations: ['rol'],
    });
    if (!user) throw new Error('Usuario no encontrado');
    return user;
  }

  // Obtener lista de ejecutivos activos
  async getEjecutivos() {
    const ejecutivos = await this.usuarioRepository
      .createQueryBuilder('u')
      .where('u.usr_inactivar = :inactivo', { inactivo: false })
      .select('u.usr_id', 'usr_id')
      .addSelect('u.usr_nombre', 'usr_nombre')
      .orderBy('u.usr_nombre', 'ASC')
      .getRawMany();

    return ejecutivos;
  }

  // Obtener centros asignados a un usuario
  async getUserCentros(userId: number) {
    try {
      console.log('getUserCentros usuario.service.ts: ', userId); // Verificar el parámetro recibido
      const centros = await this.usuariosCentrosRepository
        .createQueryBuilder('uc')
        .leftJoinAndSelect('uc.uco_co_id', 'centro')
        .where('uc.uco_usr_id = :userId', { userId })
        .orderBy('uc.es_default', 'DESC')
        .addOrderBy('uc.uco_id', 'ASC')
        .getMany();

      return centros.map((uc) => ({
        uco_id: uc.uco_id,
        co_id: uc.uco_co_id.cop_id,
        nombre: uc.uco_co_id.cop_nombre,
        activo: uc.uco_co_id.cop_estado,
        es_default: uc.es_default,
        created_at: uc.created_at,
      }));
    } catch (error) {
      console.error('Error en getUserCentros:', error);
      throw error;
    }
  }

  // Asignar un centro a un usuario
  async assignCentro(userId: number, dto: AssignCentroDto) {
    console.log(
      'assignCentro usuario.service.ts DAVID ASSIGNING CENTRO DTO: ',
      dto,
    ); // Verificar el DTO recibido
    const usuario = await this.usuarioRepository.findOne({
      where: { usr_id: userId },
    });
    if (!usuario) throw new Error('Usuario no encontrado');

    const centro = await this.centrosRepository.findOne({
      where: { cop_id: dto.co_id },
    });
    if (!centro) throw new Error('Centro de operación no encontrado');

    // Verificar si ya existe
    const existing = await this.usuariosCentrosRepository
      .createQueryBuilder('uc')
      .where('uco_usr_id = :userId', { userId })
      .andWhere('uco_co_id = :centroId', {
        centroId: dto.co_id,
      })
      .getOne();

    if (existing) throw new BadRequestException('Este centro ya está asignado');

    // Si es default, remover default de otros
    if (dto.es_default) {
      await this.usuariosCentrosRepository
        .createQueryBuilder('uc')
        .update()
        .set({ es_default: false })
        .where('uco_usr_id = :userId', { userId })
        .execute();
    }

    const newAssignment = this.usuariosCentrosRepository.create({
      uco_usr_id: usuario,
      uco_co_id: centro,
      es_default: dto.es_default ?? false,
    });

    await this.usuariosCentrosRepository.save(newAssignment);
    return { message: 'Centro asignado correctamente' };
  }

  // Asignar múltiples centros
  async assignMultipleCentros(userId: number, dto: AssignMultipleCentrosDto) {
    console.log('DAVID ASSIGNING MULTIPLE CENTROS DTO: ', dto); // Verificar el DTO recibido
    const usuario = await this.usuarioRepository.findOne({
      where: { usr_id: userId },
    });
    if (!usuario) throw new Error('Usuario no encontrado');

    // Eliminar centros anteriores
    await this.usuariosCentrosRepository
      .createQueryBuilder('uc')
      .delete()
      .where('uco_usr_id = :userId', { userId })
      .execute();

    // Asignar nuevos centros
    for (const centroDto of dto.centros) {
      const centro = await this.centrosRepository.findOne({
        where: { cop_id: centroDto.co_id },
      });
      if (!centro) continue;

      const assignment = this.usuariosCentrosRepository.create({
        uco_usr_id: usuario,
        uco_co_id: centro,
        es_default: centroDto.es_default ?? false,
      });

      await this.usuariosCentrosRepository.save(assignment);
    }

    return { message: 'Centros asignados correctamente' };
  }

  // Actualizar centro por defecto
  async setDefaultCentro(userId: number, centroId: number) {
    console.log('setDefaultCentro usuario.service.ts: ', userId, centroId);
    const usuario = await this.usuarioRepository.findOne({
      where: { usr_id: userId },
    });
    if (!usuario) throw new Error('Usuario no encontrado');

    const assignment = await this.usuariosCentrosRepository.findOne({
      where: {
        uco_usr_id: { usr_id: userId },
        uco_co_id: { cop_id: centroId },
      },
    });

    if (!assignment) throw new Error('Centro no asignado al usuario');

    // Remover default de otros
    await this.usuariosCentrosRepository
      .createQueryBuilder('uc')
      .update()
      .set({ es_default: false })
      .where('uco_usr_id = :userId', { userId })
      .execute();

    // Establecer como default
    await this.usuariosCentrosRepository
      .createQueryBuilder('uc')
      .update()
      .set({ es_default: true })
      .where('uco_id = :uco_id', { uco_id: assignment.uco_id })
      .execute();

    return { message: 'Centro por defecto actualizado' };
  }

  // Remover un centro de un usuario
  async removeCentro(userId: number, centroId: number) {
    const result = await this.usuariosCentrosRepository
      .createQueryBuilder()
      .delete()
      .where('uco_usr_id = :userId', { userId })
      .andWhere('uco_co_id = :centroId', { centroId })
      .execute();

    if (result.affected === 0) throw new Error('Centro no asignado al usuario');

    return { message: 'Centro removido correctamente' };
  }

  async findAll() {
    const usuarios = await this.usuarioRepository.find({
      relations: ['rol'],
      order: { usr_nombre: 'ASC' },
    });

    return usuarios;
  }

  async createUser(dto: {
    usr_nombre: string;
    usr_correo?: string;
    usuario_password: string;
  }) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.usuario_password, salt);

    const usuario = this.usuarioRepository.create({
      usr_nombre: dto.usr_nombre,
      usr_correo: dto.usr_correo,
      usr_password: passwordHash,
      usr_inactivar: false,
      usr_estado: 'A',
      usr_fecha_usr: new Date(),
    });

    const saved = await this.usuarioRepository.save(usuario);

    return { usr_id: saved.usr_id, message: 'Usuario creado exitosamente' };
  }

  async updateUser(
    usrId: number,
    dto: {
      usr_nombre?: string;
      usr_correo?: string;
      usuario_password?: string;
    },
  ) {
    const usuario = await this.usuarioRepository.findOne({
      where: { usr_id: usrId },
    });

    if (!usuario) throw new Error('Usuario no encontrado');

    if (dto.usr_nombre) {
      usuario.usr_nombre = dto.usr_nombre;
    }

    if (dto.usr_correo) {
      usuario.usr_correo = dto.usr_correo;
    }

    if (dto.usuario_password) {
      const salt = await bcrypt.genSalt(10);
      usuario.usr_password = await bcrypt.hash(
        dto.usuario_password,
        salt,
      );
    }

    await this.usuarioRepository.save(usuario);
    return { message: 'Usuario actualizado exitosamente' };
  }

  async deactivateUser(usrId: number) {
    return { message: 'Usuario desactivado exitosamente' };
  }

  async deleteUser(usrId: number) {
    const usuario = await this.usuarioRepository.findOne({
      where: { usr_id: usrId },
    });
    if (!usuario) throw new Error('Usuario no encontrado');

    // Eliminar asignaciones de centros primero
    await this.usuariosCentrosRepository
      .createQueryBuilder()
      .delete()
      .where('uco_usr_id = :userId', { userId: usrId })
      .execute();

    // Eliminar usuario
    await this.usuarioRepository.delete(usrId);
    return { message: 'Usuario eliminado exitosamente' };
  }
}
