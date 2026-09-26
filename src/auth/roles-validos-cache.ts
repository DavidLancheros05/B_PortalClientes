// Caché en memoria de los códigos de rol activos en pc_roles, para
// JwtAuthGuard. Antes la lista de roles válidos estaba escrita a mano en el
// guard (y en proxy.ts del frontend): un rol creado desde Seguridad → Roles
// no podía entrar hasta desplegar código.
//
// Crear, editar o inactivar un rol desde la app (SeguridadService) limpia la
// caché en el acto; TTL_MS solo aplica a cambios hechos directo en la BD o
// con el backend en varias instancias (la caché es por proceso).

const TTL_MS = 60_000;

let cache: { codigos: Set<string>; expira: number } | null = null;

export const normalizarCodigoRol = (codigo: unknown) =>
  String(codigo ?? '')
    .trim()
    .toUpperCase();

export function rolesValidosEnCache(): Set<string> | undefined {
  if (!cache || cache.expira < Date.now()) return undefined;
  return cache.codigos;
}

export function guardarRolesValidos(codigos: string[]): Set<string> {
  const set = new Set(codigos.map(normalizarCodigoRol).filter(Boolean));
  cache = { codigos: set, expira: Date.now() + TTL_MS };
  return set;
}

export function invalidarRolesValidos() {
  cache = null;
}
