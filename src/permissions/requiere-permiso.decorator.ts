import { SetMetadata } from '@nestjs/common';
import type { Permisos } from './permissions.service';

export const REQUIERE_PERMISO_KEY = 'requierePermiso';

export interface RequierePermisoMeta {
  ruta: string;
  accion: keyof Permisos;
}

// Mismo patrón que @Roles(...) (SetMetadata), pero en vez de un nombre de
// rol quemado guarda { ruta, accion } para que ModulePermissionGuard
// consulte pc_rol_modulo en vez de comparar strings.
export const RequierePermiso = (ruta: string, accion: keyof Permisos) =>
  SetMetadata(REQUIERE_PERMISO_KEY, { ruta, accion } satisfies RequierePermisoMeta);
