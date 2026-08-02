// backend/src/auth/auth.controller.ts
import { Controller, Post, Body, Logger, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

interface AuthRequest extends Request {
  user: { usr_id: number; tipo: 'cliente' | 'usuario' };
}

// Convierte el formato de JWT_EXPIRES_IN ("86400s", "7d", etc. — mismo
// formato que ya acepta @nestjs/jwt en auth.module.ts) a milisegundos para
// el maxAge de la cookie. Sin depender de `ms` (dependencia transitiva de
// jsonwebtoken, no declarada en package.json) — el formato real usado en
// este proyecto es siempre <número><unidad>, así que un parser chico basta.
function expiresToMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  const UN_DIA_MS = 24 * 60 * 60 * 1000;
  if (!match) {
    const segundos = Number(value);
    return Number.isFinite(segundos) && segundos > 0
      ? segundos * 1000
      : 7 * UN_DIA_MS;
  }
  const cantidad = Number(match[1]);
  const multiplicadores: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: UN_DIA_MS,
  };
  return cantidad * multiplicadores[match[2]];
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  // Fase 1 de la migración de auth a cookie httpOnly (ver
  // documentacion/migracion-auth-httponly.md): el login ahora ADEMÁS de
  // devolver el JWT en el body (compatibilidad, no se rompe nada existente)
  // lo manda como cookie httpOnly — el navegador no puede leerla con JS, a
  // diferencia de localStorage/la cookie que hoy pone el frontend a mano
  // (AuthContext.tsx::Cookies.set). Frontend (Vercel) y backend (Render) son
  // dominios distintos (cross-site, confirmado en vivo) — de ahí
  // SameSite=None, que a su vez exige Secure, así que en local (http) no se
  // puede usar ninguno de los dos y se cae a Lax/no-secure.
  private setAuthCookie(res: Response, token: string) {
    const esProduccion = process.env.NODE_ENV === 'production';
    res.cookie('pc_token', token, {
      httpOnly: true,
      secure: esProduccion,
      sameSite: esProduccion ? 'none' : 'lax',
      maxAge: expiresToMs(process.env.JWT_EXPIRES_IN || '7d'),
      path: '/',
    });
  }

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { identifier, password, accessType } = body;
    this.logger.log(`Login attempt: ${identifier} (${accessType})`);

    try {
      const result = await this.authService.loginWithAccessType(
        identifier,
        password,
        accessType,
      );
      this.setAuthCookie(res, result.token);
      this.logger.log(`Login successful: ${identifier}`);
      return result;
    } catch (error) {
      this.logger.warn(`Login failed for ${identifier}: ${error.message}`);
      throw error;
    }
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.identifier, body.accessType);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  // Invalida del lado del servidor la sesión actual (y cualquier otra
  // sesión activa del mismo usuario/cliente) — ver
  // AuthService.invalidarSesiones. El logout del frontend debe llamar
  // esto antes de limpiar localStorage/cookies, no solo limpiarlas.
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.invalidarSesiones(
      req.user.usr_id,
      req.user.tipo === 'cliente' ? 'cliente' : 'usuario',
    );
    // Mismos atributos que al ponerla (path/secure/sameSite) — el navegador
    // solo borra una cookie si el clearCookie coincide en esos campos.
    const esProduccion = process.env.NODE_ENV === 'production';
    res.clearCookie('pc_token', {
      httpOnly: true,
      secure: esProduccion,
      sameSite: esProduccion ? 'none' : 'lax',
      path: '/',
    });
    return { ok: true };
  }
}
