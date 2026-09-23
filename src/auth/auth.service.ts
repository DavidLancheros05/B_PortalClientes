import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import axios from 'axios';
import { InjectDataSource } from '@nestjs/typeorm';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { passwordCoincide, hashPassword } from '../common/utils/password.util';

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource()
    private readonly sistemaComercialDb: DataSource,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  private enmascararCorreo(email: string): string {
    const [usuario, dominio] = email.split('@');
    if (!usuario || !dominio) return email;
    if (usuario.length <= 4) {
      return `${usuario[0]}***@${dominio}`;
    }
    const inicio = usuario.slice(0, 2);
    const fin = usuario.slice(-2);
    return `${inicio}***${fin}@${dominio}`;
  }

  async forgotPassword(identifier: string, accessType: 'cliente' | 'usuario') {
    const RESPUESTA_GENERICA = {
      ok: true,
      mensaje:
        'Si la cuenta existe, enviamos un correo con instrucciones para restablecer la contraseña.',
    };

    let cuenta: { id: number; email: string; nombre: string } | null = null;

    if (accessType === 'cliente') {
      const rows = await this.sistemaComercialDb.query(
        `SELECT cli_id, cli_correo, cli_razon_social FROM clientes
         WHERE cli_nro_identificacion = @0 AND cli_acceso_pc = 1`,
        [identifier],
      );
      const row = rows?.[0];
      if (row?.cli_correo) {
        cuenta = {
          id: row.cli_id,
          email: row.cli_correo,
          nombre: row.cli_razon_social,
        };
      }
    } else {
      const rows = await this.sistemaComercialDb.query(
        `SELECT usr_id, usr_correo, usr_nombre FROM usuarios
         WHERE usr_usuario = @0 AND usr_acceso_pc = 1`,
        [identifier],
      );
      const row = rows?.[0];
      if (row?.usr_correo) {
        cuenta = {
          id: row.usr_id,
          email: row.usr_correo,
          nombre: row.usr_nombre,
        };
      }
    }

    if (!cuenta) return RESPUESTA_GENERICA;

    const tokenCrudo = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(tokenCrudo)
      .digest('hex');
    const expiraEn = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await this.sistemaComercialDb.query(
      `INSERT INTO dbo.param_reset_password_tokens
       (rpt_tipo, rpt_usr_id, rpt_token_hash, rpt_expira_en)
       VALUES (@0, @1, @2, @3)`,
      [accessType, cuenta.id, tokenHash, expiraEn],
    );

    // Sin default: sin esta variable el correo saldría con un link relativo
    // ("/reset-password?...") que no abre desde el cliente de correo.
    const portalUrl = String(process.env.PORTAL_CLIENTES_URL || '').trim();
    if (!portalUrl) {
      throw new Error(
        'Falta PORTAL_CLIENTES_URL en el entorno: no se puede armar el link de recuperación.',
      );
    }
    const base = portalUrl.replace(/\/login\/?$/, '').replace(/\/$/, '');
    const resetUrl = `${base}/reset-password?token=${tokenCrudo}`;

    await this.notificacionesService.notificarResetPassword({
      nombre: cuenta.nombre,
      email: cuenta.email,
      reset_url: resetUrl,
    });

    return {
      ...RESPUESTA_GENERICA,
      correoEnmascarado: this.enmascararCorreo(cuenta.email),
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Marcar como usado y leerlo en UNA sola sentencia: antes era SELECT y
    // después UPDATE, y dos peticiones simultáneas con el mismo link pasaban
    // las dos. Ahora solo una logra el UPDATE (rpt_usado = 0 en el WHERE).
    const rows = await this.sistemaComercialDb.query(
      `UPDATE dbo.param_reset_password_tokens
       SET rpt_usado = 1
       OUTPUT INSERTED.rpt_id, INSERTED.rpt_tipo, INSERTED.rpt_usr_id
       WHERE rpt_token_hash = @0 AND rpt_usado = 0 AND rpt_expira_en > SYSDATETIME()`,
      [tokenHash],
    );
    const row = rows?.[0];
    if (!row) {
      throw new UnauthorizedException(
        'El link de recuperación es inválido o ya expiró',
      );
    }

    const tipo: 'cliente' | 'usuario' =
      row.rpt_tipo === 'cliente' ? 'cliente' : 'usuario';
    const tabla = tipo === 'cliente' ? 'Clientes' : 'usuarios';
    const idColumna = tipo === 'cliente' ? 'cli_id' : 'usr_id';
    const passColumna = tipo === 'cliente' ? 'cli_password' : 'usr_password';

    const nuevaHash = await hashPassword(newPassword);

    await this.sistemaComercialDb.query(
      `UPDATE dbo.${tabla} SET ${passColumna} = @0 WHERE ${idColumna} = @1`,
      [nuevaHash, row.rpt_usr_id],
    );

    await this.invalidarSesiones(row.rpt_usr_id, tipo);

    return { ok: true, mensaje: 'Contraseña actualizada correctamente' };
  }

  async invalidarSesiones(usrId: number, tipo: 'cliente' | 'usuario') {
    const tabla = tipo === 'cliente' ? 'Clientes' : 'usuarios';
    const idColumna = tipo === 'cliente' ? 'cli_id' : 'usr_id';
    const versionColumna =
      tipo === 'cliente' ? 'cli_token_version' : 'usr_token_version';

    await this.sistemaComercialDb.query(
      `UPDATE dbo.${tabla} SET ${versionColumna} = ${versionColumna} + 1 WHERE ${idColumna} = @0`,
      [usrId],
    );
  }

  async actualizarPosicionMenu(
    usrId: number,
    tipo: 'cliente' | 'usuario',
    position: 'top' | 'left',
  ) {
    // Columna BIT en BD: 0 = top (default), 1 = left.
    const valorBit = position === 'left' ? 1 : 0;
    if (tipo === 'cliente') {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.Clientes SET cli_menu_posicion = @1 WHERE cli_id = @0`,
        [usrId, valorBit],
      );
    } else {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.usuarios SET usr_menu_posicion = @1 WHERE usr_id = @0`,
        [usrId, valorBit],
      );
    }
    return { menu_position: position };
  }

  private async loginCliente(identificacion: string, password: string) {
    const maxIntentos = Math.max(
      1,
      Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10) || 5,
    );
    const cliente = await this.sistemaComercialDb.query(
      `
      SELECT cli_id, cli_razon_social, cli_nro_identificacion, cli_password,
             cli_acceso_pc, cli_bloqueado, cli_intentos_login, cli_token_version,
             cli_menu_posicion
      FROM clientes
      WHERE cli_nro_identificacion = @0
      `,
      [identificacion],
    );

    if (!cliente || cliente.length === 0) {
      throw new UnauthorizedException('El cliente no existe');
    }

    const cli = cliente[0];

    if (!cli.cli_acceso_pc) {
      throw new UnauthorizedException(
        'Cliente no tiene acceso al portal habilitado',
      );
    }

    if (cli.cli_bloqueado) {
      throw new UnauthorizedException(
        'Cliente bloqueado por demasiados intentos fallidos. Solicita el desbloqueo al administrador.',
      );
    }

    if (!(await passwordCoincide(password, cli.cli_password))) {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.Clientes
         SET cli_intentos_login = cli_intentos_login + 1,
             cli_bloqueado = CASE
               WHEN cli_intentos_login + 1 >= @1 THEN 1
               ELSE cli_bloqueado
             END
         WHERE cli_id = @0`,
        [cli.cli_id, maxIntentos],
      );

      const intentos = Number(cli.cli_intentos_login ?? 0) + 1;
      if (intentos >= maxIntentos) {
        throw new UnauthorizedException(
          'Cliente bloqueado por demasiados intentos fallidos. Solicita el desbloqueo al administrador.',
        );
      }

      throw new UnauthorizedException('La contraseña es incorrecta');
    }

    if (Number(cli.cli_intentos_login ?? 0) > 0) {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.Clientes
         SET cli_intentos_login = 0, cli_bloqueado = 0
         WHERE cli_id = @0`,
        [cli.cli_id],
      );
    }

    // Obtener módulos del rol CLIENTE
    const rolClienteData = await this.sistemaComercialDb.query(
      `SELECT rol_id, rol_nombre FROM pc_roles WHERE rol_codigo = 'CLIENTE'`,
    );
    const modulos =
      rolClienteData.length > 0
        ? await this.permissionsService.getModulesByRole(
            rolClienteData[0].rol_id,
          )
        : [];

    const rolInfo = rolClienteData[0] || {
      rol_id: null,
      rol_nombre: 'Cliente',
    };

    const payload = {
      usr_id: cli.cli_id,
      email: '',
      rol: 'CLIENTE',
      cliente_id: cli.cli_id,
      cli_id: cli.cli_id,
      identificacion: cli.cli_nro_identificacion,
      tipo: 'cliente',
      tv: cli.cli_token_version ?? 0,
    };

    return {
      token: this.jwtService.sign(payload),
      user: {
        usr_id: cli.cli_id,
        nombre: cli.cli_razon_social,
        usuario_email: '',
        usuario_activo: cli.cli_acceso_pc,
        tipo: 'cliente',
        cliente_id: cli.cli_id,
        menu_position: cli.cli_menu_posicion ? 'left' : 'top',
        rol: {
          rol_id: rolInfo.rol_id,
          nombre: rolInfo.rol_nombre,
          codigo: 'CLIENTE',
        },
      },
      modulos,
    };
  }

  private async loginUsuarioInterno(usuario: string, password: string) {
    const maxIntentos = Math.max(
      1,
      Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10) || 5,
    );

    const usuarioData = await this.sistemaComercialDb.query(
      `
      SELECT u.usr_id, u.usr_usuario, u.usr_password, u.usr_acceso_pc,
             u.usr_inactivar, u.usr_nombre, u.usr_correo, u.ejng_id,
             u.usr_token_version, u.usr_bloqueado, u.usr_intentos_login,
             u.usr_menu_posicion,
             ur.ur_activo, ur.ur_rol_id,
             r.rol_id, r.rol_nombre, r.rol_codigo
      FROM usuarios u
      -- Solo roles activos (antes un rol desactivado podía quedar en el
      -- JWT) y con ORDER BY para que con varios roles se elija siempre el
      -- mismo (antes usuarioData[0] dependía del orden físico de SQL
      -- Server). Los permisos reales salen de TODOS los roles activos vía
      -- getModulesByUsuario / PermissionsService.resolverRolIds.
      LEFT JOIN pc_usuario_rol ur ON u.usr_id = ur.ur_usuario_id AND ur.ur_activo = 1
      LEFT JOIN pc_roles r ON ur.ur_rol_id = r.rol_id
      WHERE u.usr_usuario = @0
      ORDER BY r.rol_id
      `,
      [usuario],
    );

    if (!usuarioData || usuarioData.length === 0) {
      throw new UnauthorizedException('El usuario no existe');
    }

    const usr = usuarioData[0];

    if (!usr.usr_acceso_pc) {
      throw new UnauthorizedException(
        'Usuario no tiene acceso al portal habilitado',
      );
    }

    if (usr.usr_inactivar) {
      throw new UnauthorizedException(
        'Usuario inactivo. Solicita la activación al administrador.',
      );
    }

    if (usr.usr_bloqueado) {
      throw new UnauthorizedException(
        'Usuario bloqueado por demasiados intentos fallidos. Solicita el desbloqueo al administrador.',
      );
    }

    if (!(await passwordCoincide(password, usr.usr_password))) {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.usuarios
         SET usr_intentos_login = usr_intentos_login + 1,
             usr_bloqueado = CASE
               WHEN usr_intentos_login + 1 >= @1 THEN 1
               ELSE usr_bloqueado
             END
         WHERE usr_id = @0`,
        [usr.usr_id, maxIntentos],
      );

      const intentos = Number(usr.usr_intentos_login ?? 0) + 1;
      if (intentos >= maxIntentos) {
        throw new UnauthorizedException(
          'Usuario bloqueado por demasiados intentos fallidos. Solicita el desbloqueo al administrador.',
        );
      }

      throw new UnauthorizedException('La contraseña es incorrecta');
    }

    if (Number(usr.usr_intentos_login ?? 0) > 0) {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.usuarios
         SET usr_intentos_login = 0, usr_bloqueado = 0
         WHERE usr_id = @0`,
        [usr.usr_id],
      );
    }

    const modulos = await this.permissionsService.getModulesByUsuario(
      usr.usr_id,
    );

    const payload = {
      usr_id: usr.usr_id,
      email: usr.usr_correo || '',
      rol: usr.rol_codigo || 'USUARIO',
      cliente_id: null,
      ejng_id: usr.ejng_id || null,
      usuario: usr.usr_usuario,
      tipo: 'usuario',
      tv: usr.usr_token_version ?? 0,
    };

    return {
      token: this.jwtService.sign(payload),
      user: {
        usr_id: usr.usr_id,
        nombre: usr.usr_nombre || usr.usr_usuario,
        usuario_email: usr.usr_correo || '',
        usuario_activo: usr.ur_activo !== 0 && usr.ur_activo !== false,
        tipo: 'usuario',
        cliente_id: null,
        ejng_id: usr.ejng_id || null,
        menu_position: usr.usr_menu_posicion ? 'left' : 'top',
        rol: {
          rol_id: usr.rol_id || null,
          nombre: usr.rol_nombre || 'Usuario',
          codigo: usr.rol_codigo || 'USUARIO',
        },
      },
      modulos,
    };
  }

  private async verificarCaptcha(token: string | undefined) {
    const secret = String(process.env.RECAPTCHA_SECRET_KEY || '').trim();
    if (!secret) return;

    if (!token) {
      throw new UnauthorizedException('Completa el captcha para continuar');
    }

    const { data } = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      { params: { secret, response: token }, timeout: 10000 },
    );

    if (!data?.success) {
      throw new UnauthorizedException(
        'No se pudo verificar el captcha, intenta de nuevo',
      );
    }
  }

  async loginWithAccessType(
    identifier: string,
    password: string,
    accessType: 'cliente' | 'usuario',
    captchaToken?: string,
  ) {
    await this.verificarCaptcha(captchaToken);
    if (accessType === 'cliente') {
      return this.loginCliente(identifier, password);
    } else if (accessType === 'usuario') {
      return this.loginUsuarioInterno(identifier, password);
    } else {
      throw new UnauthorizedException('Tipo de acceso inválido');
    }
  }
}
