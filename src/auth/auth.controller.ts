// backend/src/auth/auth.controller.ts
import { Controller, Post, Patch, Body, Logger, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MenuPositionDto } from './dto/menu-position.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './public.decorator';

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
  // documentacion/Portal Clientes/Login permisos/login.md): el login manda el JWT como
  // cookie httpOnly además de en el body — el navegador no puede leerla con
  // JS, a diferencia de localStorage/la cookie que ponía el frontend a mano
  // (AuthContext.tsx::Cookies.set, retirado en Fase 2).
  //
  // Fase 3 (CSRF, 2026-09-12): originalmente esto usaba `SameSite=None` en
  // producción, asumiendo frontend (Vercel) y backend (Render) cross-site
  // de verdad. Eso cambió: el frontend ahora llama a `/api/*` en su propio
  // dominio y usa un rewrite de Next.js (`next.config.ts`) como proxy hacia
  // este backend (ver comentario en `FRONTEND/src/services/core/api.ts`) —
  // para el navegador, el request es same-site. `SameSite=None` ya no hace
  // falta para que la cookie funcione, y mantenerlo dejaba la puerta abierta
  // a CSRF (una página de otro origen podía disparar POST/PUT/PATCH/DELETE
  // y el navegador adjuntaba igual la cookie). `Lax` es suficiente: el
  // navegador ya no manda esta cookie en un request cross-site, y sigue
  // funcionando igual para toda la navegación normal de la app.
  private setAuthCookie(res: Response, token: string) {
    const esProduccion = process.env.NODE_ENV === 'production';
    res.cookie('pc_token', token, {
      httpOnly: true,
      secure: esProduccion,
      sameSite: 'lax',
      maxAge: expiresToMs(process.env.JWT_EXPIRES_IN || '7d'),
      path: '/',
    });
  }

  @Public()
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { identifier, password, accessType, captchaToken } = body;
    this.logger.log(`Login attempt: ${identifier} (${accessType})`);

    try {
      const result = await this.authService.loginWithAccessType(
        identifier,
        password,
        accessType,
        captchaToken,
      );
      this.setAuthCookie(res, result.token);
      this.logger.log(`Login successful: ${identifier}`);
      // Fase 4 (2026-09-12): el JWT ya no viaja en el body — solo en la
      // cookie httpOnly. Antes se devolvía también acá "por compatibilidad"
      // pero nada lo consumía (AuthContext.login ignora el `token` que
      // recibe, ver FRONTEND/src/context/AuthContext.tsx) y dejaba una
      // ventana de robo por XSS activo justo durante el login (interceptar
      // la respuesta del fetch/XHR, algo que la cookie httpOnly no evita
      // porque el body sigue siendo legible por JS de la página).
      const { token: _token, ...resultSinToken } = result;
      return resultSinToken;
    } catch (error) {
      this.logger.warn(`Login failed for ${identifier}: ${error.message}`);
      throw error;
    }
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.identifier, body.accessType);
  }

  @Public()
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
    // Mismos atributos que al ponerla (path/secure/sameSite, ver
    // setAuthCookie) — el navegador solo borra una cookie si el
    // clearCookie coincide en Domain/Path (SameSite/Secure/HttpOnly no
    // afectan la identidad de la cookie a efectos de sobreescribirla).
    const esProduccion = process.env.NODE_ENV === 'production';
    res.clearCookie('pc_token', {
      httpOnly: true,
      secure: esProduccion,
      sameSite: 'lax',
      path: '/',
    });
    return { ok: true };
  }

  // Preferencia "posición del menú" (arriba/izquierda) — por cuenta, no por
  // dispositivo (antes vivía solo en localStorage, ver
  // FRONTEND/src/hooks/useMenuPosition.ts).
  @UseGuards(JwtAuthGuard)
  @Patch('menu-position')
  async actualizarPosicionMenu(
    @Req() req: AuthRequest,
    @Body() body: MenuPositionDto,
  ) {
    return this.authService.actualizarPosicionMenu(
      req.user.usr_id,
      req.user.tipo === 'cliente' ? 'cliente' : 'usuario',
      body.position,
    );
  }
}
