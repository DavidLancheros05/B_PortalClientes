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
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class UsuarioService {
  constructor(
    @InjectRepository(UsuarioEntity)
    private usuarioRepository: Repository<UsuarioEntity>,
    @InjectRepository(UsuariosCentrosEntity)
    private usuariosCentrosRepository: Repository<UsuariosCentrosEntity>,
    @InjectRepository(CentroOperacionEntity)
    private centrosRepository: Repository<CentroOperacionEntity>,
    private notificacionesService: NotificacionesService,
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
    // UsuarioEntity no tiene relación "rol": el rol vive en la tabla puente
    // pc_usuario_rol (no hay FK directa en usuarios), por eso se resuelve
    // con SQL crudo en vez de relations de TypeORM.
    const rows = await this.usuarioRepository.query(`
      SELECT
        u.usr_id AS usr_id,
        u.usr_nombre AS nombre,
        u.usr_correo AS usuario_email,
        u.usr_inactivar AS usr_inactivar,
        u.usr_fecha_usr AS usuario_created_at,
        r.rol_id AS rol_id,
        r.rol_nombre AS rol_nombre
      FROM usuarios u
      LEFT JOIN pc_usuario_rol ur ON ur.ur_usuario_id = u.usr_id AND ur.ur_activo = 1
      LEFT JOIN pc_roles r ON r.rol_id = ur.ur_rol_id
      ORDER BY u.usr_nombre ASC
    `);

    return rows.map((row: any) => ({
      usr_id: row.usr_id,
      nombre: row.nombre,
      usuario_email: row.usuario_email,
      usuario_activo: !row.usr_inactivar,
      usuario_created_at: row.usuario_created_at,
      rol: row.rol_id
        ? { rol_id: row.rol_id, rol_nombre: row.rol_nombre }
        : undefined,
    }));
  }

  async createUser(dto: {
    usr_nombre: string;
    usr_correo?: string;
    usuario_password: string;
    usr_usuario: string;
    usuario_rol_id: number;
    ejng_id?: number;
  }) {
    const existente = await this.usuarioRepository.findOne({
      where: { usr_usuario: dto.usr_usuario },
    });
    if (existente) {
      throw new BadRequestException(
        `El nombre de usuario "${dto.usr_usuario}" ya está en uso`,
      );
    }

    // El login (auth.service.ts) compara la contraseña en texto plano,
    // igual que se hace para los clientes: se guarda sin hash para que
    // el usuario recién creado pueda autenticarse.
    const usuario = this.usuarioRepository.create({
      usr_id_usuario: dto.usr_usuario,
      usr_usuario: dto.usr_usuario,
      usr_nombre: dto.usr_nombre,
      usr_correo: dto.usr_correo,
      usr_password: dto.usuario_password,
      usr_inactivar: false,
      usr_estado: 'A',
      usr_fecha_usr: new Date(),
      usr_acceso_portal_clientes: true,
      usr_ejecutivo: !!dto.ejng_id,
      usr_recupera_todo: false,
      usr_exportacion: false,
      usr_elimina_cliente: false,
      ...(dto.ejng_id ? { ejng_id: dto.ejng_id } : {}),
    });

    const saved = await this.usuarioRepository.save(usuario);

    await this.usuarioRepository.query(
      `INSERT INTO pc_usuario_rol (ur_usuario_id, ur_rol_id, ur_activo, ur_created_at)
       VALUES (@0, @1, 1, GETDATE())`,
      [saved.usr_id, dto.usuario_rol_id],
    );

    if (dto.usr_correo) {
      // No debe bloquear la creación del usuario si el correo falla.
      this.notificacionesService
        .notificarCredencialesUsuario({
          nombre: dto.usr_nombre,
          usuario_email: dto.usr_correo,
          usuario_password: dto.usuario_password,
          portal_url: process.env.PORTAL_CLIENTES_URL || '',
        })
        .catch((error) =>
          console.error(
            '[UsuarioService] Error enviando correo de credenciales:',
            error,
          ),
        );
    }

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

    // Eliminar asignación de rol primero (FK hacia usuarios)
    await this.usuarioRepository.query(
      `DELETE FROM pc_usuario_rol WHERE ur_usuario_id = @0`,
      [usrId],
    );

    // Eliminar usuario
    await this.usuarioRepository.delete(usrId);
    return { message: 'Usuario eliminado exitosamente' };
  }
}
