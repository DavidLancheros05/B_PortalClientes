# Bug: "Cerrar sesión" se sentía colgado y dejaba una sesión fantasma

> Encontrado el 2026-07-25 por el usuario: *"como al dar cerrar sesion se demora una eterniadad y no aparece ningun modal le pude dar en el menu y seleccioanr otra pagiana y entro pero arriba decia rol usuario"*.

## Síntoma reportado

Al hacer clic en "Cerrar sesión" en el `Header`, no aparecía ningún indicador de carga y la navegación a `/login` se sentía colgada. El usuario, sin esperar, hizo clic en otro ítem del menú y **sí pudo entrar** a esa página protegida — pero el encabezado mostraba `rol: Usuario` (el valor de respaldo que usa `Layout.tsx` cuando `user` es `null`), es decir, quedó en un estado "sesión fantasma": ni logueado del todo, ni redirigido a login.

## Causa raíz

**Archivo:** `F_PortalClientes/src/components/layout/Header.tsx`

El logout usaba una navegación "suave" de Next.js App Router:

```ts
// ANTES
const logout = () => {
  logoutSesion();       // limpia localStorage, cookies pc_token/token, AuthContext.user = null
  router.push("/login"); // navegación client-side
};
```

`router.push` no recarga la página ni limpia el *router cache* de Next.js. Dos problemas concretos:

1. Si el usuario ya había visitado antes la página a la que navegó desde el menú (mientras "esperaba" el logout), Next.js puede servirla desde su caché de cliente **sin volver a pasar por `proxy.ts`** (el middleware que valida la cookie `pc_token`). Por eso pudo entrar a una ruta protegida sin sesión válida.
2. El `AuthContext` seguía vivo en memoria (`user = null` tras `logoutSesion()`, pero sin recarga de página no hay un estado "no autenticado" limpio) — de ahí el `rol: Usuario` en el header, que es el *fallback* del contexto, no un rol real.

**Archivo relacionado:** `F_PortalClientes/src/services/core/interceptors.ts`

El mismo patrón de navegación suave se usaba para el caso de sesión expirada (401 del backend), pero con un problema adicional: **no limpiaba credenciales antes de redirigir**.

```ts
// ANTES
if (error.response?.status === 401) {
  navigate("/login"); // → router.push, vía el helper de F_PortalClientes/src/services/core/navigation.ts
}
```

Como no se borraba `localStorage`/cookies, el interceptor de *request* seguía adjuntando el token vencido en cada llamada siguiente, generando 401 repetidos hasta que el usuario iniciara sesión manualmente de nuevo.

## Fix aplicado

En ambos puntos se reemplazó la navegación suave por una recarga completa del navegador (`window.location.href`), que garantiza: limpieza total del estado en memoria (incluido `AuthContext`), descarte del *router cache* de Next.js, y que la siguiente petición pase de nuevo por `proxy.ts`.

```ts
// Header.tsx — DESPUÉS
const [loggingOut, setLoggingOut] = useState(false);

const logout = () => {
  setLoggingOut(true); // bloquea la UI con <LoadingModal /> de inmediato
  logoutSesion();
  window.location.href = "/login";
};
```

Además, se agregó `<LoadingModal isOpen={loggingOut} message="Cerrando sesión..." />` (componente ya existente en `src/components/modals`) para que quede un overlay bloqueando clics mientras dura la recarga — el usuario reportó que, sin ese feedback, alcanzaba a hacer clic en el menú antes de que la navegación completara.

```ts
// interceptors.ts — DESPUÉS
if (error.response?.status === 401) {
  localStorage.clear();
  Cookies.remove("pc_token");
  Cookies.remove("token");
  window.location.href = "/login";
}
```

Como consecuencia, quedó sin ningún caller el helper `F_PortalClientes/src/services/core/navigation.ts` (`setNavigate`/`navigate`, usado solo para inyectar `router.push` en el interceptor) — se eliminó el archivo, y con él el `useEffect`/`useRouter` en `AuthContext.tsx` que lo registraba.

## Verificación

- `npx tsc --noEmit` y `npm run build` limpios tras los cambios (confirma que no quedó ningún import roto por borrar `navigation.ts`).
- No se pudo reproducir el timing exacto del "se demora una eternidad" en un entorno controlado (coincidió con una sesión donde además había [dos procesos duplicados del backend peleando por el puerto 3003](mejoras/COSTOS_DE_SESION.md) — probablemente agravaba la espera al dejar conexiones colgadas). El fix de navegación dura es correcto independientemente de esa causa adicional, porque cierra el hueco de "sesión fantasma" que sí se confirmó por el `rol: Usuario` reportado.

## Nota para revisar en otras pantallas

No se auditó si hay otros lugares del código que redirijan a `/login` (o a cualquier ruta pública) con `router.push` tras invalidar la sesión. Si aparece un síntoma similar (usuario "medio deslogueado", rol/datos en blanco pero la página protegida sí carga), el patrón a buscar es ese: navegación suave después de limpiar credenciales, en vez de recarga completa.
