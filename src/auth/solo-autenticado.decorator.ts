// src/auth/solo-autenticado.decorator.ts
import { SetMetadata } from '@nestjs/common';

// Marca un endpoint de mutación que, tras revisión explícita, se deja
// intencionalmente sin @RequierePermiso — autoservicio del propio usuario
// sobre su propio recurso (ej. un CLIENTE actualizando su propia
// solicitud), no una acción administrativa que deba restringirse por
// módulo/rol. Existe para que el chequeo de
// scripts/check-permisos-endpoints.mjs (Ola 3 de
// documentacion/plan-solucion-autorizacion-endpoints.md) distinga esto de
// un endpoint que simplemente nadie revisó todavía.
export const SOLO_AUTENTICADO_KEY = 'soloAutenticado';
export const SoloAutenticado = () => SetMetadata(SOLO_AUTENTICADO_KEY, true);
