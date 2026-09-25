import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import axios from 'axios';
import { InjectDataSource } from '@nestjs/typeorm';
import { PermissionsService } from '../permissions/permissions.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { passwordCoincide, hashPassword } from '../common/utils/password.util';
import { olvidarVersion } from './version-sesion-cache';

// Minutos mínimos entre dos correos de recuperación para la misma cuenta.
const RESET_ESPERA_MIN = 2;

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource()
    private readonly sistemaComercialDb: DataSource,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  // ── Bloqueo temporal por intentos fallidos ──────────────────────────────
  // Ver documentacion/Portal Clientes/Login permisos/bloqueo-temporal-login.md.
  // blq_bloqueado_hasta se calcula y compara siempre con SYSDATETIME() del
  // servidor SQL (mismo reloj en ambos lados).

  private maxIntentosLogin(): number {
    return Math.max(
      1,
      Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10) || 5,
    );
  }

  // Minutos de cada bloqueo seguido: 15 min, 1 h, 24 h (luego se repite el
  // último).
  private duracionesBloqueo(): number[] {
    const minutos = String(process.env.LOGIN_LOCK_MINUTES || '15,60,1440')
      .split(',')
      .map((n) => Number.parseInt(n.trim(), 10))
      .filter((n) => n > 0);
    return minutos.length ? minutos : [15, 60, 1440];
  }

  private mensajeBloqueo(minutos: number): string {
    const tiempo =
      minutos >= 60
        ? `${Math.ceil(minutos / 60)} hora(s)`
        : `${minutos} minuto(s)`;
    return `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${tiempo} o usa "¿Olvidaste tu contraseña?" para desbloquearla ya.`;
  }

  // Minutos que faltan si la cuenta tiene un bloqueo temporal vigente.
  private async minutosBloqueoRestantes(
    tipo: 'cliente' | 'usuario',
    cuentaId: number,
  ): Promise<number | null> {
    const rows = await this.sistemaComercialDb.query(
      `SELECT DATEDIFF(SECOND, SYSDATETIME(), blq_bloqueado_hasta) AS segundos
       FROM dbo.pc_bloqueo_login
       WHERE blq_tipo = @0 AND blq_cuenta_id = @1
         AND blq_bloqueado_hasta > SYSDATETIME()`,
      [tipo, cuentaId],
    );
    return rows?.[0]
      ? Math.max(1, Math.ceil(Number(rows[0].segundos) / 60))
      : null;
  }

  // Bloquea la cuenta y devuelve cuántos minutos. La duración escala con los
  // bloqueos seguidos; el escalón vuelve a 0 si el último bloqueo terminó
  // hace más de 24 h. Leer el escalón y guardarlo va en una transacción con
  // UPDLOCK/HOLDLOCK: sin eso, dos peticiones a la vez podían leer el mismo
  // escalón o chocar al insertar la fila (UNIQUE) y dar 500.
  private async bloquearTemporalmente(
    tipo: 'cliente' | 'usuario',
    cuentaId: number,
  ): Promise<number> {
    const duraciones = this.duracionesBloqueo();
    const qr = this.sistemaComercialDb.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [previo] = await qr.query(
        `SELECT CASE
                  WHEN blq_bloqueado_hasta IS NULL
                    OR blq_bloqueado_hasta < DATEADD(HOUR, -24, SYSDATETIME())
                  THEN 0 ELSE blq_nivel
                END AS nivel
         FROM dbo.pc_bloqueo_login WITH (UPDLOCK, HOLDLOCK)
         WHERE blq_tipo = @0 AND blq_cuenta_id = @1`,
        [tipo, cuentaId],
      );
      const nivel = Number(previo?.nivel ?? 0);
      const minutos = duraciones[Math.min(nivel, duraciones.length - 1)];

      await qr.query(
        previo
          ? `UPDATE dbo.pc_bloqueo_login
             SET blq_nivel = @2, blq_bloqueado_hasta = DATEADD(MINUTE, @3, SYSDATETIME())
             WHERE blq_tipo = @0 AND blq_cuenta_id = @1`
          : `INSERT INTO dbo.pc_bloqueo_login
               (blq_tipo, blq_cuenta_id, blq_nivel, blq_bloqueado_hasta)
             VALUES (@0, @1, @2, DATEADD(MINUTE, @3, SYSDATETIME()))`,
        [tipo, cuentaId, nivel + 1, minutos],
      );
      await qr.commitTransaction();
      return minutos;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async limpiarBloqueoTemporal(
    tipo: 'cliente' | 'usuario',
    cuentaId: number,
  ) {
    await this.sistemaComercialDb.query(
      `DELETE FROM dbo.pc_bloqueo_login WHERE blq_tipo = @0 AND blq_cuenta_id = @1`,
      [tipo, cuentaId],
    );
  }

  private columnasCuenta(tipo: 'cliente' | 'usuario') {
    return tipo === 'cliente'
      ? { tabla: 'Clientes', id: 'cli_id', intentos: 'cli_intentos_login' }
      : { tabla: 'usuarios', id: 'usr_id', intentos: 'usr_intentos_login' };
  }

  // Antes de mirar la contraseña: durante un bloqueo no se revela si es
  // correcta. Solo existe el bloqueo temporal (pc_bloqueo_login); las columnas
  // cli_bloqueado/usr_bloqueado del bloqueo permanente anterior se eliminaron
  // (migración 20260925_eliminar_columnas_bloqueado.sql).
  private async verificarCuentaNoBloqueada(
    tipo: 'cliente' | 'usuario',
    cuentaId: number,
  ) {
    const restantes = await this.minutosBloqueoRestantes(tipo, cuentaId);
    if (restantes) {
      throw new UnauthorizedException(this.mensajeBloqueo(restantes));
    }
  }

  // Contraseña incorrecta: suma el intento y, al llegar al máximo, reinicia el
  // contador y bloquea temporalmente. El conteo se decide con el valor que
  // devuelve el propio UPDATE (OUTPUT DELETED) y no con el leído al inicio
  // del login: con intentos en paralelo cada uno veía el mismo valor viejo y
  // se podían probar más contraseñas de las permitidas por ciclo.
  private async registrarIntentoFallido(
    tipo: 'cliente' | 'usuario',
    cuentaId: number,
  ): Promise<never> {
    const c = this.columnasCuenta(tipo);
    const maxIntentos = this.maxIntentosLogin();

    // OUTPUT ... INTO @tabla: Clientes/usuarios tienen triggers (de
    // Comercial) y SQL Server rechaza OUTPUT sin INTO en tablas con triggers.
    const [fila] = await this.sistemaComercialDb.query(
      `DECLARE @r TABLE (previos INT);
       UPDATE dbo.${c.tabla}
       SET ${c.intentos} = CASE
             WHEN ISNULL(${c.intentos}, 0) + 1 >= @1 THEN 0
             ELSE ISNULL(${c.intentos}, 0) + 1
           END
       OUTPUT ISNULL(DELETED.${c.intentos}, 0) INTO @r
       WHERE ${c.id} = @0;
       SELECT previos FROM @r;`,
      [cuentaId, maxIntentos],
    );
    const intentos = Number(fila?.previos ?? 0) + 1;

    if (intentos >= maxIntentos) {
      const minutos = await this.bloquearTemporalmente(tipo, cuentaId);
      throw new UnauthorizedException(this.mensajeBloqueo(minutos));
    }

    const quedan = maxIntentos - intentos;
    throw new UnauthorizedException(
      `La contraseña es incorrecta. Te queda(n) ${quedan} intento(s) antes de un bloqueo temporal.`,
    );
  }

  // Ingreso correcto: reinicia intentos y el escalón de bloqueos.
  private async registrarIngresoExitoso(
    tipo: 'cliente' | 'usuario',
    cuentaId: number,
    intentosPrevios: number,
  ) {
    const c = this.columnasCuenta(tipo);
    if (intentosPrevios > 0) {
      await this.sistemaComercialDb.query(
        `UPDATE dbo.${c.tabla} SET ${c.intentos} = 0 WHERE ${c.id} = @0`,
        [cuentaId],
      );
    }
    await this.limpiarBloqueoTemporal(tipo, cuentaId);
  }

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
         WHERE cli_nro_identificacion = @0 AND cli_acceso_pc = 1
           AND cli_estado = 'A'`,
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
    // La expiración (1 hora) se calcula con el MISMO reloj con el que la
    // valida resetPassword (SYSDATETIME() del servidor SQL). Antes se
    // calculaba en Node (el driver la escribe en UTC) y se comparaba contra
    // el reloj del servidor: según su zona horaria el link duraba 3-8 horas
    // o nacía vencido. Ver documentacion/manejo-fechas-zona-horaria.md.
    //
    // Límite de frecuencia: el endpoint es público y cada llamada manda un
    // correo, así que con solo el NIT se le podía llenar el buzón a un
    // cliente. Si ya hay un link sin usar pedido hace menos de
    // RESET_ESPERA_MIN (su vencimiento está a más de 60 - espera min), no se
    // crea otro ni se manda correo; la respuesta es la misma, no revela nada.
    // Si se crea: se borran los links anteriores de la cuenta (solo sirve el
    // último) y los usados/vencidos de todas, así la tabla no crece. UPDLOCK/
    // HOLDLOCK en una transacción: dos pedidos a la vez no pasan los dos.
    const [resultado] = await this.sistemaComercialDb.query(
      `SET XACT_ABORT ON;
       BEGIN TRANSACTION;
       IF EXISTS (
         SELECT 1 FROM dbo.param_reset_password_tokens WITH (UPDLOCK, HOLDLOCK)
         WHERE rpt_tipo = @0 AND rpt_usr_id = @1 AND rpt_usado = 0
           AND rpt_expira_en > DATEADD(MINUTE, 60 - @3, SYSDATETIME())
       )
       BEGIN
         COMMIT TRANSACTION;
         SELECT CAST(0 AS BIT) AS creado;
       END
       ELSE
       BEGIN
         DELETE FROM dbo.param_reset_password_tokens
         WHERE (rpt_tipo = @0 AND rpt_usr_id = @1)
            OR rpt_usado = 1
            OR rpt_expira_en <= SYSDATETIME();
         INSERT INTO dbo.param_reset_password_tokens
           (rpt_tipo, rpt_usr_id, rpt_token_hash, rpt_expira_en)
         VALUES (@0, @1, @2, DATEADD(HOUR, 1, SYSDATETIME()));
         COMMIT TRANSACTION;
         SELECT CAST(1 AS BIT) AS creado;
       END`,
      [accessType, cuenta.id, tokenHash, RESET_ESPERA_MIN],
    );

    if (!resultado?.creado) {
      return {
        ...RESPUESTA_GENERICA,
        correoEnmascarado: this.enmascararCorreo(cuenta.email),
      };
    }

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
    // SYSDATETIME() debe ser el mismo reloj con el que se calculó
    // rpt_expira_en al crear el token (ver arriba).
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
    const prefijo = tipo === 'cliente' ? 'cli' : 'usr';

    const nuevaHash = await hashPassword(newPassword);

    // Usar el link del correo demuestra que es el dueño de la cuenta, así
    // que también la desbloquea: antes cambiaba la contraseña pero la cuenta
    // seguía bloqueada y había que llamar a la empresa para desbloquearla.
    await this.sistemaComercialDb.query(
      `UPDATE dbo.${tabla}
       SET ${passColumna} = @0, ${prefijo}_intentos_login = 0
       WHERE ${idColumna} = @1`,
      [nuevaHash, row.rpt_usr_id],
    );

    await this.limpiarBloqueoTemporal(tipo, row.rpt_usr_id);
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
    // Sin esto el token revocado seguiría valiendo hasta que venza la
    // caché de JwtAuthGuard.
    olvidarVersion(tipo, usrId);
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
    const cliente = await this.sistemaComercialDb.query(
      `
      SELECT cli_id, cli_razon_social, cli_nro_identificacion, cli_password,
             cli_acceso_pc, cli_intentos_login, cli_token_version,
             cli_menu_posicion, cli_estado
      FROM clientes
      WHERE cli_nro_identificacion = @0
      -- El NIT solo es único entre clientes activos
      -- (UX_Clientes_NroIdentificacion_Activo): puede haber inactivos con el
      -- mismo número. Primero el activo; sin ORDER BY podía tomar el inactivo.
      ORDER BY CASE WHEN cli_estado = 'A' THEN 0 ELSE 1 END, cli_id DESC
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

    // Antes solo se miraba cli_acceso_pc y un cliente inactivo con acceso
    // podía entrar.
    if (cli.cli_estado !== 'A') {
      throw new UnauthorizedException(
        'Cliente inactivo. Solicita la activación al administrador.',
      );
    }

    await this.verificarCuentaNoBloqueada('cliente', cli.cli_id);

    const intentosPrevios = Number(cli.cli_intentos_login ?? 0);
    if (!(await passwordCoincide(password, cli.cli_password))) {
      await this.registrarIntentoFallido('cliente', cli.cli_id);
    }
    await this.registrarIngresoExitoso('cliente', cli.cli_id, intentosPrevios);

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
    const usuarioData = await this.sistemaComercialDb.query(
      `
      SELECT u.usr_id, u.usr_usuario, u.usr_password, u.usr_acceso_pc,
             u.usr_inactivar, u.usr_nombre, u.usr_correo, u.ejng_id,
             u.usr_token_version, u.usr_intentos_login,
             u.usr_menu_posicion,
             ur.ur_activo, ur.ur_rol_id,
             r.rol_id, r.rol_nombre, r.rol_codigo
      FROM usuarios u
      -- Solo roles activos (antes un rol desactivado podía quedar en el
      -- JWT). Los permisos reales salen de TODOS los roles activos vía
      -- getModulesByUsuario / PermissionsService.resolverRolIds.
      LEFT JOIN pc_usuario_rol ur ON u.usr_id = ur.ur_usuario_id AND ur.ur_activo = 1
      LEFT JOIN pc_roles r ON ur.ur_rol_id = r.rol_id
      WHERE u.usr_usuario = @0
      -- usr_usuario NO es único: la tabla la comparte otro sistema y hay
      -- logins repetidos (ej. dos "Administrador", uno sin acceso al
      -- portal). Se toma primero el que tiene acceso al portal, luego el
      -- que tiene rol, y el rol de menor id. Ojo: un ORDER BY r.rol_id a
      -- secas ponía primero las filas SIN rol (NULL va primero en SQL
      -- Server) y dejó al admin real sin poder entrar.
      ORDER BY
        CASE WHEN u.usr_acceso_pc = 1 THEN 0 ELSE 1 END,
        CASE WHEN r.rol_id IS NULL THEN 1 ELSE 0 END,
        r.rol_id,
        u.usr_id
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

    await this.verificarCuentaNoBloqueada('usuario', usr.usr_id);

    const intentosPrevios = Number(usr.usr_intentos_login ?? 0);
    if (!(await passwordCoincide(password, usr.usr_password))) {
      await this.registrarIntentoFallido('usuario', usr.usr_id);
    }
    await this.registrarIngresoExitoso('usuario', usr.usr_id, intentosPrevios);

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
