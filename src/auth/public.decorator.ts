// src/auth/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

// Marca un endpoint como intencionalmente alcanzable sin sesión (login,
// forgot-password, reset-password). JwtAuthGuard, registrado como guard
// global (ver app.module.ts), lo chequea primero y deja pasar sin exigir
// JWT si está presente.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
