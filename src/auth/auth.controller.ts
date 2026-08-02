// backend/src/auth/auth.controller.ts
import { Controller, Post, Body, Logger, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

interface AuthRequest extends Request {
  user: { usr_id: number; tipo: 'cliente' | 'usuario' };
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: LoginDto) {
    const { identifier, password, accessType } = body;
    this.logger.log(`Login attempt: ${identifier} (${accessType})`);

    try {
      const result = await this.authService.loginWithAccessType(
        identifier,
        password,
        accessType,
      );
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
  async logout(@Req() req: AuthRequest) {
    await this.authService.invalidarSesiones(
      req.user.usr_id,
      req.user.tipo === 'cliente' ? 'cliente' : 'usuario',
    );
    return { ok: true };
  }
}
