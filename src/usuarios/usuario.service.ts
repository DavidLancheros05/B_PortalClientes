import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsuarioEntity } from './entities/usuario.entity';
import { hashComercial, passwordCoincide } from '../common/utils/password.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

// Regla del Sistema Comercial (LoginController.Password): mínimo 5.
const MIN_LONGITUD_PASSWORD = 5;

function validarLongitudPassword(password: string) {
  if (password.length < MIN_LONGITUD_PASSWORD) {
    throw new BadRequestException(
      `La contraseña debe tener al menos ${MIN_LONGITUD_PASSWORD} caracteres`,
    );
  }
}

@Injectable()
export class UsuarioService {
  constructor(
    @InjectRepository(UsuarioEntity)
    private usuarioRepository: Repository<UsuarioEntity>,
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
    return passwordCoincide(password, user.usr_password);
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
    validarLongitudPassword(newPassword);

    // Formato del Sistema Comercial: la misma contraseña sirve en ambos.
    user.usr_password = hashComercial(newPassword);

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

  async findAll() {
    // El rol vive en la tabla puente pc_usuario_rol (many-to-many real: un
    // usuario puede tener varios roles activos, ver /usuario-roles) — este
    // listado no lo muestra, así que no hace falta traerlo aquí. Antes hacía
    // un LEFT JOIN asumiendo un solo rol por usuario, lo que duplicaba la
    // fila del usuario cuando tenía más de un rol activo.
    const rows = await this.usuarioRepository.query(`
      SELECT
        u.usr_id AS usr_id,
        u.usr_nombre AS nombre,
        u.usr_id_usuario AS usuario_login,
        u.usr_correo AS usuario_email,
        u.usr_inactivar AS usr_inactivar,
        u.usr_fecha_usr AS usuario_created_at,
        u.usr_intentos_login AS usr_intentos_login,
        -- Bloqueo temporal vigente por intentos fallidos (solo informativo,
        -- se levanta solo — ver auth.service.ts / pc_bloqueo_login).
        DATEDIFF(MINUTE, SYSDATETIME(), b.blq_bloqueado_hasta) AS usr_bloqueo_min_restantes
      FROM usuarios u
      LEFT JOIN dbo.pc_bloqueo_login b
        ON b.blq_tipo = 'usuario' AND b.blq_cuenta_id = u.usr_id
       AND b.blq_bloqueado_hasta > SYSDATETIME()
      ORDER BY u.usr_nombre ASC
    `);

    return rows.map((row: any) => ({
      usr_id: row.usr_id,
      nombre: row.nombre,
      usuario_login: row.usuario_login,
      usuario_email: row.usuario_email,
      usuario_activo: !row.usr_inactivar,
      usuario_created_at: row.usuario_created_at,
      usr_intentos_login: Number(row.usr_intentos_login ?? 0),
      usr_bloqueado: row.usr_bloqueo_min_restantes != null,
      usr_bloqueo_min_restantes:
        row.usr_bloqueo_min_restantes != null
          ? Math.max(1, Number(row.usr_bloqueo_min_restantes))
          : null,
    }));
  }

  // Nombre de login (usr_id_usuario) de quien hace el cambio, para
  // usr_usuario: en el Sistema Comercial esa columna es auditoría ("quién
  // creó/editó"), no el login.
  private async loginDe(usrId?: number): Promise<string | null> {
    if (!usrId) return null;
    const autor = await this.usuarioRepository.findOne({
      where: { usr_id: usrId },
      select: ['usr_id_usuario'],
    });
    return autor?.usr_id_usuario ?? null;
  }

  async createUser(
    dto: {
      usr_nombre: string;
      usr_correo?: string;
      usuario_password: string;
      usr_id_usuario: string;
      usuario_rol_id: number;
      ejng_id?: number;
    },
    autorUsrId?: number,
  ) {
    // usr_id_usuario es el login en ambos sistemas y es único (el Comercial
    // valida lo mismo en GuardarUsuario).
    const existente = await this.usuarioRepository.findOne({
      where: { usr_id_usuario: dto.usr_id_usuario },
    });
    if (existente) {
      throw new BadRequestException(
        `El nombre de usuario "${dto.usr_id_usuario}" ya está en uso`,
      );
    }
    validarLongitudPassword(dto.usuario_password);

    const usuario = this.usuarioRepository.create({
      usr_id_usuario: dto.usr_id_usuario,
      usr_usuario: (await this.loginDe(autorUsrId)) ?? dto.usr_id_usuario,
      usr_nombre: dto.usr_nombre,
      usr_correo: dto.usr_correo,
      // Formato del Sistema Comercial: la misma contraseña sirve en ambos.
      usr_password: hashComercial(dto.usuario_password),
      usr_inactivar: false,
      usr_estado: 'A',
      usr_fecha_usr: new Date(),
      usr_acceso_pc: true,
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
          usuario_login: dto.usr_id_usuario,
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
      usuario_activo?: boolean;
    },
    autorUsrId?: number,
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
      validarLongitudPassword(dto.usuario_password);
      usuario.usr_password = hashComercial(dto.usuario_password);
    }

    if (dto.usuario_activo !== undefined) {
      usuario.usr_inactivar = !dto.usuario_activo;
    }

    // Auditoría igual que el Comercial (EditarUsuario): quién lo editó.
    const autor = await this.loginDe(autorUsrId);
    if (autor) usuario.usr_usuario = autor;
    usuario.usr_fecha_usr = new Date();

    await this.usuarioRepository.save(usuario);
    return { message: 'Usuario actualizado exitosamente' };
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
