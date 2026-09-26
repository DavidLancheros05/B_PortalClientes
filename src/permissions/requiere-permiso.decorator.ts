import { SetMetadata } from '@nestjs/common';
import type { Permisos } from './permissions.service';

export const REQUIERE_PERMISO_KEY = 'requierePermiso';

export interface RequierePermisoMeta {
  rutas: string[];
  accion: keyof Permisos;
}

// Mismo patrón que @Roles(...) (SetMetadata), pero en vez de un nombre de
// rol quemado guarda { rutas, accion } para que ModulePermissionGuard
// consulte pc_rol_modulo en vez de comparar strings.
//
// `ruta` puede ser una lista: basta con tener el permiso en CUALQUIERA de
// esas pantallas. Para acciones compartidas por varias pantallas (ej. los
// soportes de análisis de OFC, CC1 y CC2).
export const RequierePermiso = (
  ruta: string | string[],
  accion: keyof Permisos,
) =>
  SetMetadata(REQUIERE_PERMISO_KEY, {
    rutas: Array.isArray(ruta) ? ruta : [ruta],
    accion,
  } satisfies RequierePermisoMeta);
