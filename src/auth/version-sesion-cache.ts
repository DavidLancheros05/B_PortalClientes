// Caché en memoria de "esta sesión sigue vigente" para JwtAuthGuard.
//
// Sin esto, cada llamada al API hacía un viaje a la BD (remota, ~0.3 s)
// solo para comparar la versión del token (ver
// documentacion/Portal Clientes/mejoras/escalabilidad-rendimiento.md, 4.4).
//
// Solo se guardan resultados positivos, por TTL_MS. Revocar una sesión
// desde la app (AuthService.invalidarSesiones: logout, cambio de
// contraseña) limpia la entrada en el acto, así que el retraso de TTL_MS
// solo aplica si la versión se cambia directo en la BD, o si el backend
// corre en varias instancias (la caché es por proceso).

const TTL_MS = 30_000;
const MAX_ENTRADAS = 10_000;

// clave `${tipo}:${id}` → versión vigente y hasta cuándo vale
const cache = new Map<string, { tv: number; expira: number }>();

const clave = (tipo: 'cliente' | 'usuario', id: number) => `${tipo}:${id}`;

export function versionEnCache(
  tipo: 'cliente' | 'usuario',
  id: number,
): number | undefined {
  const entrada = cache.get(clave(tipo, id));
  if (!entrada) return undefined;
  if (entrada.expira < Date.now()) {
    cache.delete(clave(tipo, id));
    return undefined;
  }
  return entrada.tv;
}

export function guardarVersion(
  tipo: 'cliente' | 'usuario',
  id: number,
  tv: number,
) {
  if (cache.size >= MAX_ENTRADAS) {
    const ahora = Date.now();
    for (const [k, v] of cache) if (v.expira < ahora) cache.delete(k);
    if (cache.size >= MAX_ENTRADAS) cache.clear();
  }
  cache.set(clave(tipo, id), { tv, expira: Date.now() + TTL_MS });
}

export function olvidarVersion(tipo: 'cliente' | 'usuario', id: number) {
  cache.delete(clave(tipo, id));
}
