# Migración de autenticación a cookie httpOnly (2026-08-02)

## Contexto

`ANALISIS_FRONTEND.md` (mayo 2026) señalaba el JWT en `localStorage` como
riesgo crítico (robable por XSS) y recomendaba migrar a httpOnly cookies.
Auditoría en vivo (2026-08-02) confirmó que ese fix nunca se hizo de
verdad: existe una cookie `pc_token`, pero la pone el **frontend con JS**
(`AuthContext.tsx::Cookies.set()`, librería `js-cookie`) — no es httpOnly,
así que da la misma exposición a XSS que `localStorage`. Detalle completo
de la auditoría (proxy.ts, AuthContext.tsx, api.ts, JwtAuthGuard,
token_version) en el chat de esa fecha; no se repite acá.

**Topología real, verificada en vivo** (no asumida): frontend
`https://f-portal-clientes.vercel.app`, backend
`https://b-portalclientes-1.onrender.com` — dominios registrables
distintos (`vercel.app` vs `onrender.com`), **cross-site de verdad**. CORS
en producción ya soporta credenciales para ese origen exacto (probado con
`curl -X OPTIONS` contra el backend real: `access-control-allow-credentials:
true`, `access-control-allow-origin` refleja el origen exacto, no `*`).

Por ser cross-site, la cookie de auth necesita `SameSite=None; Secure` en
producción — eso a su vez reabre CSRF (que `SameSite=Lax/Strict` bloquearía
gratis), así que la migración completa requiere protección CSRF explícita
(patrón *double-submit*) antes de poder retirar el mecanismo viejo.

## Plan por fases (para minimizar riesgo — auth es sensible)

- **Fase 1 — Backend, compatibilidad** ✅ hecha esta sesión (ver abajo).
- **Fase 2 — Frontend**: `axios` con `withCredentials: true`; eliminar
  `Cookies.set()`/`localStorage.token` de `AuthContext.tsx`; dejar solo
  `user` (perfil, no credencial) en estado/localStorage.
- **Fase 3 — CSRF**: patrón double-submit para `POST/PUT/PATCH/DELETE`.
- **Fase 4 — Limpieza**: backend deja de devolver el JWT en el body de
  `/auth/login`; el guard retira el soporte al header `Authorization` (solo
  si no quedan consumidores dependiendo de él — scripts, Playwright, etc.);
  eliminar código legado (`interceptors.ts`, lecturas de `document.cookie`).

## Fase 1 — hecha y verificada en vivo (2026-08-02)

**Objetivo de esta fase: no romper nada.** El body de `/auth/login` sigue
trayendo el JWT igual que siempre (compatibilidad con scripts/consumidores
actuales); además, ahora también se manda como cookie httpOnly.

### Cambios

1. **`AuthController.login`** (`src/auth/auth.controller.ts`): además de
   devolver `{ token, user, modulos }` en el body (sin cambios), pone
   `Set-Cookie: pc_token=...; HttpOnly; Path=/; Max-Age=<JWT_EXPIRES_IN>`
   — en producción (`NODE_ENV=production`) suma `Secure; SameSite=None`;
   en dev cae a `SameSite=Lax` sin `Secure` (una cookie `Secure` nunca se
   manda por `http://localhost`).

   ✅ **`NODE_ENV=production` confirmado y verificado en producción real,
   2026-08-02**: no estaba seteado en Render — se agregó a mano en el
   dashboard. Efecto colateral no previsto al agregarlo: `npm install`
   empezó a omitir `devDependencies` (`@nestjs/cli` incluido), rompiendo el
   build (`sh: 1: nest: not found`). Fix: variable adicional
   `NPM_CONFIG_PRODUCTION=false` + "Clear build cache & deploy" (el primer
   redeploy con la variable nueva reusó un `node_modules` cacheado ya
   podado del intento anterior, así que "up to date" no reinstalaba nada;
   hubo que forzar limpiar el caché). Con ambas variables el build volvió a
   pasar.

   Verificado con el commit `24329e7` ya desplegado, contra el backend real
   (`https://b-portalclientes-1.onrender.com/api/auth/login`, cliente de
   prueba 13606 con password temporal, restaurada al terminar):
   `Set-Cookie: pc_token=...; HttpOnly; Secure; SameSite=None` (no `Lax`,
   confirmando que `NODE_ENV=production` sí está activo), y
   `GET /solicitudes/2192/documentos` (protegido) respondiendo `200 OK`
   usando solo esa cookie, sin header `Authorization`.

2. **`AuthController.logout`**: además de invalidar la sesión (`token_version`,
   sin cambios), ahora también limpia la cookie (`res.clearCookie` con los
   mismos atributos que al ponerla — necesario para que el navegador la
   borre de verdad).

3. **`JwtAuthGuard`** (`src/auth/jwt-auth.guard.ts`): antes solo leía
   `Authorization: Bearer`. Ahora, si no viene ese header, cae a
   `request.cookies.pc_token`. Ambos caminos pasan por la misma
   verificación de firma + `token_version` de siempre — no se relajó nada,
   solo se agregó una segunda fuente para el token. `cookie-parser` ya
   estaba montado en `main.ts` (usado por otra cosa, sin relación) —
   no hizo falta agregar nada de infraestructura nueva.

### Verificado en vivo, backend real corriendo, sin mocks

Contraseña temporal en el cliente de prueba (13606, "David Prueba 2") para
poder pegarle al login real (no solo a `mint-jwt.mjs`, que firma el JWT
directo y se salta el controller) — restaurada al hash original al
terminar.

1. `POST /api/auth/login` real → `Set-Cookie: pc_token=...; Max-Age=86400;
   Path=/; HttpOnly; SameSite=Lax` (sin `Secure`, correcto en dev). El
   `Max-Age=86400` coincide exacto con `JWT_EXPIRES_IN=86400s` del `.env`.
2. `GET /api/solicitudes/2192/documentos` (protegido por `JwtAuthGuard`)
   **solo con la cookie, sin header `Authorization`** → `200 OK`.
3. El mismo endpoint **solo con `Authorization: Bearer <token de
   mint-jwt.mjs>`, sin cookie** → `200 OK` — mecanismo viejo intacto.
4. `POST /api/auth/logout` → `Set-Cookie: pc_token=; Expires=Thu, 01 Jan
   1970...` (la borra) + incrementa `cli_token_version` en BD.
5. Reintentar el mismo endpoint protegido con la cookie ya inválida (post-logout)
   → `401 Unauthorized`. Con una cookie nueva (login de nuevo) → `200 OK`.
   (Nota: el primer intento de este paso se hizo contra
   `GET /solicitudes/cliente/:clienteId`, que resultó no tener
   `@UseGuards(JwtAuthGuard)` — dio 200 igual, falso positivo. Repetido
   contra un endpoint sí protegido, con el resultado correcto de arriba.)

`tsc --noEmit` limpio.

### Verificado también contra producción real (post-deploy, commit `24329e7`)

Mismo procedimiento (contraseña temporal en cliente 13606, restaurada al
terminar) pero contra `https://b-portalclientes-1.onrender.com`:

1. `POST /api/auth/login` → `Set-Cookie: pc_token=...; Max-Age=86400;
   Path=/; HttpOnly; Secure; SameSite=None` — a diferencia de dev, sí trae
   `Secure`/`SameSite=None` (confirma `NODE_ENV=production` activo).
2. `GET /api/solicitudes/2192/documentos` solo con la cookie → `200 OK`.

Con esto, la Fase 1 queda cerrada tanto en dev como en producción real —
la Fase 2 (frontend) puede arrancar sin dependencias pendientes de
infraestructura.

## Qué NO cambió en esta fase (a propósito)

- El frontend sigue exactamente igual — `AuthContext.tsx` sigue poniendo su
  propia cookie no-httpOnly y usando `localStorage.token`. La cookie
  httpOnly nueva del backend hoy **no la usa nadie todavía** del lado del
  navegador real, porque el frontend no manda `withCredentials`/`credentials:
  include` en sus requests — sin eso, el navegador ni siquiera guarda el
  `Set-Cookie` de una respuesta cross-site. Eso es exactamente el trabajo
  de la Fase 2.
- `mint-jwt.mjs`, `curl` con `Authorization: Bearer`, y cualquier prueba
  automatizada existente siguen funcionando sin tocar nada.
