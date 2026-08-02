// auth/jwt-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Roles válidos para acceder a la API. Un JWT con firma correcta pero un rol
// fuera de esta lista se rechaza igual (ver también proxy.ts en el
// frontend, que aplica la misma whitelist en el edge).
const ROLES_PERMITIDOS = [
  'CLIENTE',
  'EJECUTIVO',
  'COMERCIAL',
  'ADMINISTRACION',
  'ADMIN',
  'ASC',
  'OC',
  'CC1',
  'CC2',
];

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // Fase 1 de la migración a cookie httpOnly (ver
    // documentacion/migracion-auth-httponly.md): acepta el header
    // Authorization (mecanismo actual — scripts, curl, mint-jwt.mjs siguen
    // funcionando sin cambios) y, si no viene, cae a la cookie httpOnly
    // `pc_token` que el login ya empezó a emitir. Período de transición
    // intencional — no retirar el soporte al header hasta que el frontend
    // esté migrado por completo (Fase 2+).
    const token = authHeader
      ? authHeader.split(' ')[1]
      : request.cookies?.pc_token;

    if (!token) throw new UnauthorizedException('Token no provisto');

    let payload: any;
    try {
      const secret = this.configService.get<string>('JWT_SECRET');
      payload = this.jwtService.verify(token, { secret });
    } catch (err: any) {
      this.logger.warn(`Token inválido: ${err.message}`);
      throw new UnauthorizedException('Token inválido');
    }

    if (!ROLES_PERMITIDOS.includes(payload.rol)) {
      this.logger.warn(`Rol no válido en token: ${payload.rol}`);
      throw new UnauthorizedException('Rol no válido');
    }

    // Invalidación de sesión server-side: el JWT lleva la versión vigente
    // al momento de emitirse (claim `tv`); si no coincide con la versión
    // actual en BD, la sesión fue revocada (logout, cambio de contraseña,
    // etc.) aunque el token no haya expirado todavía.
    const vigente = await this.esVersionVigente(payload);
    if (!vigente) {
      throw new UnauthorizedException('Sesión revocada');
    }

    request.user = payload;
    return true;
  }

  private async esVersionVigente(payload: any): Promise<boolean> {
    if (typeof payload.tv !== 'number' || !payload.usr_id) {
      // Tokens antiguos (emitidos antes de esta migración) no tienen `tv`
      // — se aceptan hasta que expiren por sí solos, no se puede revocar
      // retroactivamente algo que nunca se registró.
      return true;
    }

    const tabla = payload.tipo === 'cliente' ? 'Clientes' : 'usuarios';
    const idColumna = payload.tipo === 'cliente' ? 'cli_id' : 'usr_id';
    const versionColumna =
      payload.tipo === 'cliente' ? 'cli_token_version' : 'usr_token_version';

    const rows = await this.dataSource.query(
      `SELECT ${versionColumna} AS tv FROM dbo.${tabla} WHERE ${idColumna} = @0`,
      [payload.usr_id],
    );

    if (!rows || rows.length === 0) return false;
    return Number(rows[0].tv) === payload.tv;
  }
}
