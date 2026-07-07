// auth/jwt-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    console.log('------------------------------------authguard---------');
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    console.log('🔹 Authorization header:', authHeader);

    if (!authHeader) throw new UnauthorizedException('Token no provisto');

    const token = authHeader.split(' ')[1];
    try {
      const secret =
        this.configService.get<string>('JWT_SECRET') || 'mi_super_secreto';
      const payload = this.jwtService.verify(token, {
        secret,
      });
      console.log('🔹 Token payload:', payload);

      request.user = payload;
      // ✅ Validación basada en rol - Lista de roles permitidos
      const rolesPermitidos = [
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

      if (!rolesPermitidos.includes(payload.rol)) {
        throw new UnauthorizedException('Rol no válido');
      }

      console.log(`🟢 Rol aceptado: ${payload.rol}`);
      return true;
    } catch (err) {
      console.error('❌ Error verificando token:', err.message);
      throw new UnauthorizedException('Token inválido');
    }
  }
}
