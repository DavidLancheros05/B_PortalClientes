import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { InjectDataSource } from '@nestjs/typeorm';
import { UsersService } from '../users/users.service';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource()
    private readonly sistemaComercialDb: DataSource,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async loginCliente(identificacion: string, password: string) {
    const cliente = await this.sistemaComercialDb.query(
      `
      SELECT cli_id, cli_razon_social, cli_nro_identificacion, cli_password, cli_acceso_portal_clientes
      FROM clientes
      WHERE cli_nro_identificacion = @0
      `,
      [identificacion],
    );

    if (!cliente || cliente.length === 0) {
      throw new UnauthorizedException('El cliente no existe');
    }

    const cli = cliente[0];

    if (!cli.cli_acceso_portal_clientes) {
      throw new UnauthorizedException(
        'Cliente no tiene acceso al portal habilitado',
      );
    }

    if (cli.cli_password !== password) {
      throw new UnauthorizedException('La contraseña es incorrecta');
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
    };

    return {
      token: this.jwtService.sign(payload),
      user: {
        usr_id: cli.cli_id,
        nombre: cli.cli_razon_social,
        usuario_email: '',
        usuario_activo: cli.cli_acceso_portal_clientes,
        tipo: 'cliente',
        cliente_id: cli.cli_id,
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
    console.log(
      `[AuthService] loginUsuarioInterno called with usuario: ${usuario}`,
    );

    const usuarioData = await this.sistemaComercialDb.query(
      `
      SELECT u.usr_id, u.usr_usuario, u.usr_password, u.usr_acceso_portal_clientes,
             u.usr_nombre, u.usr_correo,
             ur.ur_activo, ur.ur_rol_id,
             r.rol_id, r.rol_nombre, r.rol_codigo
      FROM usuarios u
      LEFT JOIN pc_usuario_rol ur ON u.usr_id = ur.ur_usuario_id
      LEFT JOIN pc_roles r ON ur.ur_rol_id = r.rol_id
      WHERE u.usr_usuario = @0
      `,
      [usuario],
    );

    if (!usuarioData || usuarioData.length === 0) {
      throw new UnauthorizedException('El usuario no existe');
    }

    const usr = usuarioData[0];

    if (!usr.usr_acceso_portal_clientes) {
      throw new UnauthorizedException(
        'Usuario no tiene acceso al portal habilitado',
      );
    }

    if (usr.usr_password !== password) {
      throw new UnauthorizedException('La contraseña es incorrecta');
    }

    const modulos = await this.permissionsService.getModulesByUsuario(
      usr.usr_id,
    );

    const payload = {
      usr_id: usr.usr_id,
      email: usr.usr_correo || '',
      rol: usr.rol_codigo || 'USUARIO',
      cliente_id: null,
      usuario: usr.usr_usuario,
      tipo: 'usuario',
    };
    console.log(
      `[AuthService] Usuario ${usuario} autenticado exitosamente. Payload para JWT:`,
      payload,
    );

    return {
      token: this.jwtService.sign(payload),
      user: {
        usr_id: usr.usr_id,
        nombre: usr.usr_nombre || usr.usr_usuario,
        usuario_email: usr.usr_correo || '',
        usuario_activo: usr.ur_activo !== 0 && usr.ur_activo !== false,
        tipo: 'usuario',
        cliente_id: null,
        rol: {
          rol_id: usr.rol_id || null,
          nombre: usr.rol_nombre || 'Usuario',
          codigo: usr.rol_codigo || 'USUARIO',
        },
      },
      modulos,
    };
  }

  async loginWithAccessType(
    identifier: string,
    password: string,
    accessType: 'cliente' | 'usuario',
  ) {
    console.log(
      `[AuthService] loginWithAccessType called with identifier: ${identifier}, accessType: ${accessType}`,
    );
    if (accessType === 'cliente') {
      return this.loginCliente(identifier, password);
    } else if (accessType === 'usuario') {
      return this.loginUsuarioInterno(identifier, password);
    } else {
      throw new UnauthorizedException('Tipo de acceso inválido');
    }
  }

  async login(email: string, password: string) {
    console.log(`[AuthService] login called with email: ${email}`);

    const user = await this.usersService.getUserByEmail(email);

    if (!user)
      throw new UnauthorizedException('Usuario o contraseña incorrectos');

    if (!user.usuario_activo)
      throw new UnauthorizedException('Usuario inactivo');

    const match = await bcrypt.compare(password, user.usuario_password_hash);
    if (!match)
      throw new UnauthorizedException('Usuario o contraseña incorrectos');

    let cliente_id: number | null = user.cliente_id ?? null;
    const rolCodigo = String(user.rol_codigo || '')
      .toUpperCase()
      .trim();
    const isAdminRole =
      rolCodigo === 'ADMIN' ||
      rolCodigo === 'ADMINISTRACION' ||
      rolCodigo === 'ADMINISTRACIÓN';

    if (rolCodigo === 'CLIENTE') {
      if (!user.cliente_habilita_acceso)
        throw new UnauthorizedException('Cliente sin acceso habilitado');
      cliente_id = user.cliente_id;
    }

    if (isAdminRole && !cliente_id) {
      cliente_id = await this.usersService.assignOrCreateClientForAdmin(
        user.usr_id,
      );
    }

    console.log(
      `[AuthService] Usuario ${email} autenticado exitosamente. Cliente ID asignado: ${cliente_id}, Rol: ${user.rol_codigo}`,
    );

    const modulos = await this.permissionsService.getModulesByRole(user.rol_id);
    const centrosOperacion = await this.usersService.getUserCentrosOperacion(
      user.usr_id,
    );
    const centroDefault = centrosOperacion.find((c: any) => c.es_default);

    const payload = {
      usr_id: user.usr_id,
      email: user.usuario_email,
      rol: user.rol_codigo,
      usuario_email: user.usuario_email,
      rol_codigo: user.rol_codigo,
      cliente_id,
      co_id: centroDefault?.co_id ?? null,
    };

    return {
      token: this.jwtService.sign(payload),
      user: {
        usr_id: user.usr_id,
        nombre: user.nombre,
        usuario_email: user.usuario_email,
        usuario_activo: user.usuario_activo,
        cliente_id,
        co_id: centroDefault?.co_id ?? null,
        centros_operacion: centrosOperacion,
        rol: {
          rol_id: user.rol_id,
          nombre: user.rol_nombre,
          codigo: user.rol_codigo,
        },
      },
      modulos,
    };
  }
}
