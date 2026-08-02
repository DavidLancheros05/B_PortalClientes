# Autenticación y seguridad de sesión

**Actualización 2026-07-27:** tres arreglos relacionados con "a dónde llega
el usuario" y "qué pasa si hay varias pestañas abiertas" — ver
[Links de correo por etapa, `?next=` tras login, y detección de sesión
cambiada entre pestañas](#links-de-correo-por-etapa-next-tras-login-y-detección-de-sesión-cambiada-entre-pestañas)
al final del documento.

**Actualización 2026-07-24 (tarde):** los 7 hallazgos de la sección
[Hallazgos y riesgos de seguridad](#hallazgos-y-riesgos-de-seguridad) ya
están arreglados — ver
[Estado de las soluciones](#estado-de-las-soluciones-2026-07-24) al final
del documento para el detalle de qué cambió y qué queda pendiente de
desplegar/ejecutar.

**Actualización 2026-07-24 (noche):** se agregó un flujo real de "Olvidé mi
contraseña" (antes no existía nada self-service, solo reseteo manual por un
admin) — ver
[Recuperación de contraseña ("Olvidé mi contraseña")](#recuperación-de-contraseña-olvidé-mi-contraseña)
al final del documento.

Documentado el 2026-07-24 a raíz de una pregunta sobre por qué, al entrar por
primera vez a `http://localhost:3002/solicitudes/cliente` en una sesión de
pruebas, el portal ya mostraba al usuario logueado en vez de pedir login.
Respuesta corta: es el comportamiento esperado del diseño actual — la sesión
se persiste en el navegador (cookie de 7 días + `localStorage` sin
expiración propia) y no hay revalidación contra el backend al cargar una
página, así que "entrar por primera vez a una URL" no es lo mismo que
"primera vez que este navegador inicia sesión". Ver la sección
[¿Por qué parece que ya había sesión iniciada?](#por-qué-parece-que-ya-había-sesión-iniciada).

## Resumen del flujo

1. El usuario llena el form en `FRONTEND/src/app/login/page.tsx`, eligiendo
   tipo de acceso `cliente` o `usuario` (interno).
2. `POST /api/auth/login` (`BACKEND/src/auth/auth.controller.ts`) llama a
   `AuthService.loginWithAccessType`, que despacha a `loginCliente` o
   `loginUsuarioInterno` según el tipo.
3. El backend valida credenciales contra SQL Server y firma un JWT.
4. El frontend recibe `{ token, user, modulos }`, y `AuthContext.login()`
   guarda **tres cosas por separado**: `localStorage.token`,
   `localStorage.user`, y la cookie `pc_token`.
5. En cada navegación a una ruta protegida, `FRONTEND/src/proxy.ts` (edge
   middleware de Next.js) valida la cookie `pc_token` **antes de que cargue
   cualquier JS de la página** — si falta o es inválida, redirige 307 a
   `/login`.
6. Las llamadas del cliente axios (`services/core/interceptors.ts`) agregan
   el JWT como `Authorization: Bearer` en cada request al backend, que lo
   valida de nuevo con `JwtAuthGuard`.

Es decir: **hay dos verificaciones JWT completamente independientes**, una
en el edge (Next.js, con `jose`) y otra en el backend (NestJS, con
`passport-jwt`/`JwtService`), cada una con su propio código y — hoy en
local — la misma cadena de secreto por coincidencia (ver más abajo).

## Backend — emisión del JWT

### Dos flujos de login reales, uno muerto

`AuthService` (`BACKEND/src/auth/auth.service.ts`) tiene **tres** métodos de
login, pero solo dos están conectados al controller:

- `loginWithAccessType(identifier, password, accessType)` — es el que
  realmente usa `AuthController` (`POST /api/auth/login`). Despacha a:
  - `loginCliente(identificacion, password)` — busca en `clientes` por
    `cli_nro_identificacion`.
  - `loginUsuarioInterno(usuario, password)` — busca en `usuarios` por
    `usr_usuario`, con join a `pc_usuario_rol`/`pc_roles` para el rol activo.
- `login(email, password)` — **código muerto**, no lo llama nada
  (confirmado por búsqueda en todo `src/`). Usa `bcrypt.compare` contra
  `UsersService.getUserByEmail`, un mecanismo de auth completamente distinto
  y no usado hoy. No confundirlo con los dos de arriba al leer el archivo.

### Las contraseñas se comparan en texto plano

Tanto `loginCliente` como `loginUsuarioInterno` comparan la contraseña
recibida contra la columna de BD con `!==` directo:

```ts
if (cli.cli_password !== password) { ... }        // loginCliente
if (usr.usr_password !== password) { ... }         // loginUsuarioInterno
```

No hay hash (`bcrypt`, `argon2`, etc.) — `cli_password`/`usr_password` se
guardan y comparan en texto plano. `bcrypt.compare` sí se usa, pero
únicamente dentro del método muerto `login()`. Esto es un hallazgo de
seguridad real, no solo de estilo — ver
[Hallazgos y riesgos](#hallazgos-y-riesgos-de-seguridad).

### El secreto del JWT

`AuthModule` (`BACKEND/src/auth/auth.module.ts`) registra `JwtModule` así:

```ts
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get<string>('JWT_SECRET'),
    signOptions: { expiresIn: '7d' },
  }),
}),
```

- El secreto sale de `JWT_SECRET` en `.env`. En local vale literalmente
  `mi_super_secreto`.
- **La expiración está hardcodeada a `7d`**, ignorando por completo la
  variable `JWT_EXPIRES_IN=86400s` que sí existe en `.env` (línea 15) — es
  config muerta, nadie la lee. El JWT real dura 7 días sin importar lo que
  diga esa variable.

### Verificación en el backend — dos mecanismos redundantes

Hay **dos** piezas que verifican el JWT en cada request al backend, no una:

1. **`JwtStrategy`** (`BACKEND/src/auth/jwt.strategy.ts`, Passport) — usada
   donde se aplique el guard estándar de Passport.
2. **`JwtAuthGuard`** (`BACKEND/src/auth/jwt-auth.guard.ts`) — un guard
   manual (no usa Passport, llama `jwtService.verify` directo) que es el
   que realmente decora los controllers (`@UseGuards(JwtAuthGuard)`, ver
   `pedidos.controller.ts` como ejemplo). Además de validar la firma, aplica
   una whitelist de roles hardcodeada:

   ```ts
   const rolesPermitidos = ['CLIENTE', 'EJECUTIVO', 'COMERCIAL',
     'ADMINISTRACION', 'ADMIN', 'ASC', 'OC', 'CC1', 'CC2'];
   if (!rolesPermitidos.includes(payload.rol)) {
     throw new UnauthorizedException('Rol no válido');
   }
   ```

   Un rol nuevo que no esté en esta lista queda bloqueado de **todo**
   endpoint con `JwtAuthGuard`, aunque tenga JWT válido y permisos en
   `pc_rol_modulo`.

   También loguea con `console.log` el header `Authorization` completo y el
   payload decodificado en cada request — ruidoso, y en el peor caso deja
   el JWT de usuarios reales en los logs del servidor.

3. Ambos (`JwtStrategy` y `JwtAuthGuard`) tienen el mismo fallback si
   `JWT_SECRET` no está seteado: `'mi_super_secreto'` literal, hardcodeado
   en el código fuente en **dos lugares distintos**.

## Frontend — persistencia de sesión

`AuthContext.login(token, userData)`
(`FRONTEND/src/context/AuthContext.tsx`) guarda el mismo JWT que llegó del
backend en tres sitios:

```ts
localStorage.setItem("token", token);
Cookies.set("pc_token", token, { expires: 7 });   // cookie, 7 días
// ...
localStorage.setItem("user", JSON.stringify(normalizedUser));
```

- **`localStorage.token`** — sin expiración propia (`localStorage` no
  expira nunca solo); lo usa el interceptor de axios para las llamadas a la
  API.
- **Cookie `pc_token`** — expira a los 7 días (coincide con el `7d` del JWT
  del backend, pero es una coincidencia de que alguien puso el mismo número
  en dos sitios, no algo derivado del `exp` real del token). La lee
  `proxy.ts` en el servidor/edge, antes de renderizar cualquier página.
- **`localStorage.user`** — copia del objeto usuario devuelto por el login,
  para no tener que llamar al backend por los datos básicos en cada carga.

`pc_token` se llama así (no `token`) porque las cookies de `localhost` no
distinguen puerto, y otra app local corriendo con una cookie `token` la
pisaba, cerrando la sesión del portal sin explicación aparente — renombrado
el 2026-07-22.

### `proxy.ts` — el gate real de rutas protegidas

```ts
const SECRET_STRING = "mi_super_secreto";   // hardcodeado, sin fallback a env var
// ...
const token = req.cookies.get("pc_token")?.value;
if (!token) return NextResponse.redirect(new URL("/login", req.url));
try {
  await jwtVerify(token, SECRET_KEY, { algorithms: ["HS256"] });
  return NextResponse.next();
} catch {
  // borra la cookie y redirige a /login
}
```

Puntos importantes:

- Solo valida que la **firma** sea correcta — no mira `rol`, `exp`
  explícitamente vía lógica propia (aunque `jwtVerify` sí rechaza tokens
  vencidos por sí mismo), ni ningún otro campo del payload. Cualquier JWT
  válido pasa, sin importar qué usuario o rol represente.
- El secreto está **hardcodeado en el código fuente del frontend**
  (`"mi_super_secreto"`, sin leer de variable de entorno). Como este archivo
  corre en el edge de Next.js (no en el navegador), el string no queda
  expuesto al usuario final en el bundle de cliente, pero sí queda expuesto
  a cualquiera con acceso al repo — y es el mismo string usado como
  fallback en el backend.
- `config.matcher` decide qué rutas pasan por este chequeo:
  `/dashboard`, `/solicitudes`, `/pedidos`, `/consultas`, `/aprobaciones`,
  `/condiciones-financieras`, `/admin`, `/perfil` (con `:path*`, o sea
  incluye todas las subrutas). Cualquier ruta nueva que deba quedar detrás
  de login **tiene que agregarse a mano** a este `matcher` — no es
  automático (mismo patrón que el menú dinámico, ver
  [`menu-dinamico-pc-modulos.md`](menu-dinamico-pc-modulos.md)).
- `/login` está explícitamente exceptuado al inicio de la función.

### `AuthContext` — no revalida contra el backend

Al montar la app (`FRONTEND/src/context/AuthContext.tsx`, `useEffect`
inicial):

1. Si no hay `localStorage.token` → `loading=false`, `user=null` (queda sin
   sesión; si la ruta está protegida, `proxy.ts` ya habría redirigido antes
   de llegar aquí).
2. Si hay `token` y hay `localStorage.user` → **usa ese `user` guardado tal
   cual**, sin llamar a ningún endpoint tipo `/auth/me` para confirmar que
   el token siga siendo válido o que los datos no hayan cambiado.
3. Si hay `token` pero no hay `user` (localStorage parcialmente limpio) →
   crea un `user` placeholder vacío y confía en que el interceptor de axios
   resuelva la sesión real en la primera llamada a la API.

Comentario explícito en el código sobre el punto 3: *"No hacemos `getMe()`
porque puede fallar y limpiar el token válido"* — es una decisión
consciente, no un descuido.

### Interceptor de axios

`FRONTEND/src/services/core/interceptors.ts`:

- En cada request: agrega `Authorization: Bearer <token>`, tomando el token
  de `localStorage.token`, o si no está, de la cookie `pc_token`.
- En cada response con `401`: navega a `/login` (vía el helper
  `navigate()`, inyectado desde el router de Next). No limpia
  `localStorage` ni la cookie en este punto — solo redirige.

### Logout — dos implementaciones distintas, solo una conectada

- `AuthContext.logout()` — limpia claves puntuales:
  `token`, `user`, `modulos` de `localStorage`, y las cookies `pc_token` y
  `token`. **No está conectado a ningún botón del UI** por lo que se pudo
  encontrar en `Header.tsx`.
- `Header.tsx` define su **propio** `logout()` local, que es el que
  disparan los botones "Cerrar sesión":

  ```ts
  const logout = () => {
    localStorage.clear();   // borra TODO localStorage, no solo las claves de auth
    Cookies.remove("pc_token");
    Cookies.remove("token");
    router.push("/login");
  };
  ```

  Usa `localStorage.clear()` en vez de borrar claves puntuales — más
  agresivo que el de `AuthContext`, y borraría cualquier otra cosa que la
  app guarde ahí en el futuro sin relación con la sesión.

En ningún caso el logout llama al backend — es puramente client-side. El
JWT que quedó en el `Authorization` header de alguna pestaña vieja (o
cacheado en un proxy) sigue siendo válido hasta que expire por sí solo (7
días); no hay revocación/blacklist de tokens.

## Autorización — qué puede ver/hacer cada rol

Esto es un sistema separado de la autenticación (JWT válido) — ver el
detalle completo en
[`menu-dinamico-pc-modulos.md`](menu-dinamico-pc-modulos.md). En resumen:
`pc_modulos` + `pc_rol_modulo` deciden qué aparece en el menú y qué puede
hacer cada rol (`ver`/`crear`/`editar`/`eliminar`/`aprobar`) por módulo. Un
JWT válido con rol no listado en `rolesPermitidos` de `JwtAuthGuard` (ver
arriba) queda bloqueado de la API entera, independientemente de lo que diga
`pc_rol_modulo`.

## ¿Por qué parece que "ya había sesión iniciada"?

Con este diseño, **entrar por primera vez a una URL no equivale a "primera
vez que el navegador tiene sesión"**. La sesión sobrevive:

- Cerrar y reabrir el navegador (cookie `pc_token` dura 7 días;
  `localStorage` no expira solo).
- Reiniciar los servidores de dev (backend/frontend) — el JWT sigue siendo
  válido mientras no cambie `JWT_SECRET` y no haya pasado su `exp`.
- Navegar directo a una ruta protegida sin pasar por `/login` — si la
  cookie es válida, `proxy.ts` deja pasar sin pedir nada.

Si en una sesión de pruebas ya se había hecho login antes (aunque haya sido
días atrás, en ese mismo perfil de navegador), reabrir cualquier ruta del
portal reutiliza esa sesión tal cual, mostrando al usuario ya autenticado.
Esto es el comportamiento esperado del diseño actual (persistencia tipo
"recuérdame" implícita, sin opción de sesión corta) — no un bug — salvo que
se esté probando específicamente el flujo de "usuario nuevo sin sesión",
en cuyo caso hay que limpiar `localStorage` + cookies manualmente (o usar
una ventana de incógnito) antes de probar.

## Hallazgos y riesgos de seguridad

Registrados aquí para decidir a futuro si se atacan, no arreglados en esta
sesión:

1. **Contraseñas en texto plano** — `loginCliente`/`loginUsuarioInterno`
   comparan `!==` directo contra la columna de BD, sin hash. Es el
   mecanismo real de login (el que sí usa `bcrypt` está muerto/sin usar).
2. **Secreto JWT hardcodeado en el código fuente**, con el mismo valor
   literal (`mi_super_secreto`) repetido en tres archivos del backend
   (`jwt.strategy.ts`, `jwt-auth.guard.ts`, como fallback) y uno del
   frontend (`proxy.ts`, sin fallback — es el único valor que usa). Si en
   producción `JWT_SECRET` de Render llegara a diferir de este string, el
   gate de `proxy.ts` empezaría a rechazar a todos los usuarios (cookie
   firmada con un secreto, verificada contra otro).
3. **`JWT_EXPIRES_IN` en `.env` no se usa** — la expiración real está
   hardcodeada a `7d` en `auth.module.ts`, sin relación con esa variable.
4. **Sin invalidación de sesión server-side** — logout es 100% client-side;
   un JWT robado o copiado de `localStorage`/la cookie sigue siendo válido
   hasta su expiración natural, sin forma de revocarlo antes.
5. **`JwtAuthGuard` loguea el header `Authorization` completo y el payload
   decodificado** con `console.log` en cada request — filtra JWTs de
   usuarios reales a los logs del proceso backend.
6. **Dos implementaciones de logout inconsistentes** — la de
   `AuthContext.logout()` no está conectada a ningún botón; la que sí se
   usa (`Header.tsx`) hace `localStorage.clear()` completo en vez de borrar
   solo las claves de sesión.
7. **`proxy.ts` no valida `rol` ni ningún otro campo del payload**, solo la
   firma — cualquier JWT válido (de cualquier rol, incluso uno que
   `JwtAuthGuard` rechazaría después en el backend) pasa el gate de rutas
   del frontend.

## Soluciones propuestas (implementadas el 2026-07-24)

Una por hallazgo, en el mismo orden. **Ver
[Estado de las soluciones](#estado-de-las-soluciones-2026-07-24) al final
del documento** para qué de esto ya está en el código vs. qué falta
desplegar/ejecutar.

1. **Contraseñas en texto plano** → hashear con `bcrypt` (ya está en
   `package.json`, solo no se usa en el flujo real) al crear/actualizar
   `cli_password`/`usr_password`, y cambiar la comparación de
   `loginCliente`/`loginUsuarioInterno` de `!==` a `bcrypt.compare()`.
   Requiere una migración de datos: las contraseñas ya guardadas en texto
   plano hay que rehashearlas una vez (no se puede hacer "on the fly" sin
   invalidar logins existentes, salvo que se rehashee en el próximo login
   exitoso de cada usuario con la contraseña en texto plano como
   transición).
2. **Secreto JWT hardcodeado** → sacar el literal `"mi_super_secreto"` de
   `proxy.ts`, `jwt.strategy.ts` y `jwt-auth.guard.ts`; en el frontend leer
   de una env var de servidor (ej. `JWT_SECRET`, no `NEXT_PUBLIC_*` porque
   no debe llegar al bundle de cliente) configurada en Vercel con el mismo
   valor que `JWT_SECRET` de Render; quitar los fallbacks hardcodeados del
   backend (que la app falle al arrancar si falta la env var, no que caiga
   silenciosamente a un secreto público).
3. **`JWT_EXPIRES_IN` sin usar** → en `auth.module.ts`, cambiar
   `signOptions: { expiresIn: '7d' }` por
   `signOptions: { expiresIn: configService.get('JWT_EXPIRES_IN') || '7d' }`,
   y alinear el `expires` de la cookie `pc_token` en `AuthContext.tsx` al
   mismo valor en vez de tener `7` hardcodeado por separado.
4. **Sin invalidación server-side** → llevar una lista/tabla de tokens
   revocados (o de "sesiones activas" por `usr_id`/`cli_id` con un
   `jti` por token) que `JwtAuthGuard` consulte además de verificar la
   firma; alternativa más simple sin tabla nueva: bajar el `expiresIn` a
   algo corto (ej. 1-2h) y agregar refresh token, para que un JWT robado
   tenga ventana de uso limitada aunque no se pueda revocar al toque.
5. **Logs con JWT/payload completos** → quitar los `console.log` de
   `authHeader` y `payload` en `jwt-auth.guard.ts`, o si se necesita
   trazabilidad, loguear solo `payload.usr_id`/`payload.rol`, nunca el
   token ni el payload completo.
6. **Dos logout inconsistentes** → borrar el `logout()` local de
   `Header.tsx` y usar el de `AuthContext` (conectándolo a los botones
   "Cerrar sesión" vía `useContext(AuthContext)`), para tener un solo lugar
   que defina qué se limpia al salir. Si de verdad se quiere limpiar todo
   `localStorage` al salir (no solo las claves de auth), hacerlo explícito
   dentro de `AuthContext.logout()` en vez de duplicar la función.
7. **`proxy.ts` no valida rol** → si se quiere gatear por rol también en el
   edge (no solo firma), decodificar el payload tras `jwtVerify` (ya lo
   devuelve) y comparar `payload.rol` contra los roles permitidos en cada
   entrada del `matcher` (hoy esa validación de rol solo existe en
   `JwtAuthGuard`, del lado del backend, no en el frontend).

## Estado de las soluciones (2026-07-24)

Implementado y probado en local (login real → llamada protegida → logout →
reintento con el mismo token → `401 Sesión revocada`). Nada de esto se
desplegó a producción todavía — ver la nota de despliegue al final.

1. **Contraseñas hasheadas con bcrypt** — `common/utils/password.util.ts`
   (nuevo) centraliza `hashPassword()`/`passwordCoincide()`.
   `passwordCoincide` acepta hash bcrypt (`$2a$`/`$2b$`/`$2y$`) o texto
   plano legado, así que el login no se rompió para cuentas que aún no
   están rehasheadas. Todos los puntos de escritura de contraseña ya
   hashean: `auth.service.ts` (login, ya no escribe), `usuario.service.ts`
   (`createUser`, `updateUser`, `changePassword`), `clientes.service.ts`
   (`create`, `update`, `changePasswordCliente`). **Falta ejecutar**
   `scripts/hash-passwords.mjs --apply` para rehashear lo que hoy sigue en
   texto plano (confirmado en dry-run: 54 `usuarios` + 5 `Clientes`) — es
   idempotente y no bloquea nada mientras no corra, pero hasta que corra
   esas contraseñas siguen legibles en la BD.
2. **Secreto JWT sin hardcodear** — `jwt.strategy.ts` y `jwt-auth.guard.ts`
   ahora leen `JWT_SECRET` sin fallback; `main.ts` falla al arrancar si
   falta. `proxy.ts` (frontend) lee `process.env.JWT_SECRET` (agregado a
   `F_PortalClientes/.env.local`) y, si falta, rechaza todo en vez de usar
   un secreto adivinable. **Pendiente de desplegar**: agregar `JWT_SECRET`
   en Vercel con el mismo valor que tiene `JWT_SECRET` en Render — si no se
   hace antes del deploy, el backend no arranca (Render) y/o el frontend
   redirige a todos a `/login` (Vercel).
3. **`JWT_EXPIRES_IN` conectado** — `auth.module.ts` ahora usa
   `configService.get('JWT_EXPIRES_IN') || '7d'`. Confirmado con un login
   real: `exp - iat = 86400s`, igual al valor de `.env`. Esto cambia el
   comportamiento real (antes duraba 7 días fijo, ahora dura lo que diga la
   env var) — revisar que el valor en Render sea el que se quiere en
   producción antes de desplegar.
4. **Invalidación de sesión server-side** — se optó por la alternativa de
   "versión de token" en vez de blacklist: migración
   `20260724_agregar_token_version_sesion.sql` (ya corrida contra la BD)
   agrega `usr_token_version`/`cli_token_version`. El JWT lleva la versión
   vigente como claim `tv`; `JwtAuthGuard` la compara contra la BD en cada
   request (tokens viejos sin `tv`, emitidos antes de este cambio, se
   aceptan igual hasta que expiren — no se puede revocar retroactivamente
   algo que nunca se registró). Nuevo endpoint `POST /api/auth/logout`
   (protegido) incrementa la versión, invalidando de inmediato **todas**
   las sesiones activas de ese usuario/cliente, no solo la que cerró
   sesión.
5. **Logs verbosos eliminados** — `jwt-auth.guard.ts` ya no imprime el
   header `Authorization` ni el payload decodificado en cada request; solo
   loguea con `Logger.warn` cuando algo falla (token inválido, rol no
   permitido), sin volcar el token. De paso se encontró y quitó un
   `console.log(body)` en `auth.controller.ts` que imprimía el **password
   en texto plano** de cada intento de login en los logs del servidor.
6. **Logout unificado** — se eliminó la copia local de `Header.tsx`;
   ahora usa `useContext(AuthContext).logout()`. `AuthContext.logout()` es
   la única implementación: llama a `POST /auth/logout` (best-effort, no
   bloquea si falla) y después limpia `localStorage` completo + ambas
   cookies.
7. **`proxy.ts` valida rol** — después de `jwtVerify`, compara
   `payload.rol` contra la misma whitelist que usa `JwtAuthGuard` en el
   backend (duplicada a propósito, son repos git separados). Un JWT con
   firma válida pero rol fuera de la lista ahora también se rechaza en el
   edge, no solo en la API.

### Nota de despliegue

Estos cambios viven solo en los working directories locales de
`BACKEND`/`FRONTEND` — no se hizo commit ni push. Antes de subir a
producción, en orden:

1. Confirmar/agregar `JWT_SECRET` en Vercel (mismo valor que Render).
2. Confirmar el valor deseado de `JWT_EXPIRES_IN` en Render (antes no tenía
   efecto real; ahora sí).
3. Decidir si correr `scripts/hash-passwords.mjs --apply` contra la BD real
   antes o después del deploy (es seguro en cualquier orden, es
   retrocompatible).
4. Recién ahí commitear y desplegar backend y frontend.

## Recuperación de contraseña ("Olvidé mi contraseña")

Implementado el 2026-07-24 — antes no existía ningún flujo self-service;
solo un admin podía resetear la contraseña de un cliente/usuario a mano
(`Parametrización → Clientes` / `Seguridad → Usuarios`).

- **Tabla nueva** `param_reset_password_tokens`
  (`20260724_crear_tabla_reset_password_tokens.sql`): un token por
  solicitud, con `rpt_tipo` (`cliente`/`usuario`), `rpt_usr_id`,
  `rpt_expira_en` (1 hora) y `rpt_usado`. **El token real nunca se guarda**
  — solo su hash SHA-256 (`rpt_token_hash`), mismo criterio que las
  contraseñas: el valor en texto plano viaja una sola vez, por correo.
- **`POST /api/auth/forgot-password`** (`{ identifier, accessType }`) —
  busca la cuenta, genera un token de 32 bytes random, lo guarda hasheado,
  y envía un correo (plantilla `RESET_PASSWORD`, nueva en
  `notificaciones.service.ts`) con el link
  `{{PORTAL_CLIENTES_URL sin /login}}/reset-password?token=...`. **Responde
  siempre el mismo mensaje genérico**, exista o no la cuenta — evita que
  alguien use este endpoint para enumerar identificaciones/usuarios
  válidos.
- **`POST /api/auth/reset-password`** (`{ token, newPassword }`) — hashea
  el token recibido y lo busca por `rpt_token_hash` con `rpt_usado = 0` y
  `rpt_expira_en > ahora`. Si no lo encuentra, rechaza con un mensaje
  genérico ("inválido o expiró", sin distinguir "no existe" de "ya se
  usó"). Si es válido: hashea la contraseña nueva con bcrypt, la guarda,
  marca el token `rpt_usado = 1` (un solo uso) y llama
  `AuthService.invalidarSesiones` — cierra cualquier sesión activa de esa
  cuenta, por si un JWT viejo seguía circulando.
- **Frontend**: `/forgot-password` (pide identificador, siempre muestra el
  mensaje genérico) y `/reset-password?token=...` (pide contraseña nueva +
  confirmación). Ninguna de las dos rutas está en el `matcher` de
  `proxy.ts`, así que quedan públicas por defecto, igual que `/login` — no
  hizo falta tocar el middleware. Link "¿Olvidaste tu contraseña?" agregado
  en `/login`.
- **Probado end-to-end** con curl contra un cliente real: pedir el link →
  resetear con el token → reusar el mismo token (rechazado, `401`) → login
  con la contraseña nueva (funciona) → login con la contraseña vieja
  (rechazado). El envío de correo real (SMTP) tarda ~10s — no es un bug de
  este cambio, es la latencia normal del proveedor de correo que ya usa el
  resto de la app.
- **Pendiente**: como con el resto de cambios de este documento, esto vive
  solo en local — falta commit/push y desplegar (ver
  [Nota de despliegue](#nota-de-despliegue) arriba, aplica igual aquí).

## Links de correo por etapa, `?next=` tras login, y detección de sesión cambiada entre pestañas

Implementado el 2026-07-27, a raíz de revisar qué URL llevan realmente los
correos de cada etapa del workflow y qué le pasa a una pestaña abierta si
otra pestaña del mismo navegador cierra sesión y entra con otra cuenta.
Igual que el resto de este documento: vive en local, falta commit/push y
desplegar.

### 1. Los correos de etapa no armaban el link de destino

**Diagnóstico.** Los 8 correos que dependen de `PORTAL_CLIENTES_URL`
(`BACKEND/src/notificaciones/notificaciones.service.ts`) usaban el valor
crudo de la variable de entorno como link — sin `id` de solicitud ni ruta de
la etapa. En este entorno `PORTAL_CLIENTES_URL=http://localhost:3002/login`,
así que **todos** los correos de workflow (ASC, OC, CC1, CC2, ejecutivo,
rechazos, correos al cliente) llevaban al usuario a `/login` a secas, nunca
a la solicitud puntual. El único correo que sí armaba bien su link era
`RESET_PASSWORD` (`BACKEND/src/auth/auth.service.ts:75-78`), que le quita el
sufijo `/login` a la variable antes de concatenar la ruta — ese patrón nunca
se replicó para los correos de etapa.

**Arreglo.** Nuevo helper privado
`NotificacionesService.construirPortalUrl(ruta)` (mismo criterio que
`auth.service.ts`: quita `/login` final y arma `${base}${ruta}`). Cada
llamada que arma `variables.portal_url` ahora construye la ruta específica:

| Origen del correo | Ruta que arma |
|---|---|
| `notificarSolicitudPendienteAlRol` (ASC/OC/CC1/CC2) | `/solicitudes/gestion-<etapa>/{id}/gestionar` (mapa `rutaPorRol`) |
| `notificarSolicitudPendienteAlEjecutivo` (registro inicial) | `/solicitudes/gestion-ejecutivo-negocios/{id}/registrar` (nótese: `registrar`, no `gestionar`, distinto de las otras 4 etapas) |
| `notificarRechazoAlEjecutivo` (rechazo definitivo OFC/CC2) | `/solicitudes/rechazadas-ejecutivo/{id}` |
| `notificarRegistroSolicitud`, `notificarEstadoSolicitud`, `notificarRechazoSolicitud`, `notificarRechazoDefinitivoSolicitud`, `notificarCondicionesFinancieras` (correos al cliente) | `/solicitudes/{id}` (vista de solo lectura, `FRONTEND/src/app/solicitudes/[id]/page.tsx`) |

**A propósito sin tocar:** `clientes.service.ts:304,376` y
`usuario.service.ts:325` (correos de "credenciales de usuario nuevo") siguen
usando `PORTAL_CLIENTES_URL` crudo — ahí sí corresponde mandar a `/login`
porque no hay una solicitud puntual a la que apuntar, es el primer ingreso
de una cuenta recién creada.

### 2. El destino se perdía al pasar por `/login`

**Diagnóstico.** Aunque el link del correo apuntara bien a la solicitud, el
usuario sin sesión de todas formas caía en `/login` (vía `proxy.ts`) y, tras
autenticarse, `FRONTEND/src/app/login/page.tsx` siempre hacía
`router.replace("/inicio")` fijo — no leía ningún `next`/`redirect`/
`callbackUrl` de la URL. El destino original se descartaba sin dejar rastro.

**Arreglo — tres archivos:**

- **`proxy.ts`**: nuevo helper `redirectToLogin(req)` que arma
  `new URL("/login", req.url)` con `?next=<pathname+search original>`
  agregado vía `searchParams.set`, usado en los 4 puntos donde antes se
  hacía `NextResponse.redirect(new URL("/login", req.url))` a secas (sin
  token, `SECRET_KEY` no configurado, JWT inválido, rol fuera de la
  whitelist).
- **`login/page.tsx`**: reestructurado igual que `reset-password/page.tsx`
  (componente interno `LoginForm` + `export default` envuelto en
  `<Suspense>`, requerido por Next.js para usar `useSearchParams` en una
  página). Lee `searchParams.get("next")`, lo valida con
  `destinoSeguro()` (debe empezar en `/` y no en `//`, para evitar que
  alguien arme `?next=https://sitio-malicioso` o `?next=//sitio-malicioso`
  como open redirect) y hace `router.replace(next || "/inicio")` tras un
  login exitoso.
- **`useAuth.tsx`** (guard client-side, usado directo por las páginas
  `gestion-*/[id]/gestionar`): el `router.push("/login")` que dispara cuando
  falta `token`/`user` en `localStorage` ahora agrega
  `?next=${encodeURIComponent(pathname+search)}` de la misma forma.

### 3. Sin sincronización entre pestañas — una pestaña vieja podía actuar como otra cuenta

**Diagnóstico.** `AuthContext.tsx` carga el `user` desde `localStorage` una
sola vez al montar (`useEffect` con deps `[]`) y no escuchaba el evento
`storage`. Como `localStorage`/cookie `pc_token` se comparten por origen
(no por pestaña), el escenario real era: Pestaña A con sesión de Usuario 1
abierta; en Pestaña B se cierra sesión y se entra con Usuario 2 (sobrescribe
`localStorage.token`/`user` y la cookie). Pestaña A, sin recargar:

- Seguía mostrando en pantalla el nombre/rol/menú de **Usuario 1** (estado
  de React nunca se actualizó).
- Pero cada llamada nueva a la API ya mandaba el token de **Usuario 2**,
  porque `services/core/interceptors.ts` lee `localStorage.getItem("token")`
  en fresco en cada request. Es decir: la UI mentía sobre quién estaba
  actuando — cualquier acción que Pestaña A ejecutara (aprobar una
  evaluación, por ejemplo) quedaba atribuida a Usuario 2 en el backend,
  aunque en pantalla se viera como si la hiciera Usuario 1.
- Si Pestaña A navegaba a otra página o recargaba, `proxy.ts` validaba la
  cookie vigente (ya la de Usuario 2) y la pestaña "se convertía" en la
  sesión de Usuario 2 sin ningún aviso explícito.

**Arreglo.** `AuthContext.tsx`:

- `tokenRef` (un `useRef`) guarda el token que esta pestaña cree tener
  activo — se actualiza en la carga inicial, en `login()` y en `logout()`.
- Nuevo `useEffect` con `window.addEventListener("storage", ...)`. El
  evento `storage` del navegador solo se dispara en las pestañas que **no**
  hicieron el cambio (comportamiento estándar, no hace falta lógica propia
  para evitar el auto-disparo), así que es la señal correcta. El handler
  ignora eventos de otras claves; para `key === "token"` o `key === null`
  (este último lo dispara `localStorage.clear()`, que es lo que hace
  `logout()`) compara el `localStorage.getItem("token")` actual contra
  `tokenRef.current`.
- Si difieren, se activa un banner fijo arriba de toda la app (`AuthProvider`
  vive en `FRONTEND/src/app/layout.tsx`, el layout raíz, así que aparece sin
  importar la página): *"La sesión cambió en otra pestaña de este
  navegador. Recarga esta pestaña para seguir de forma segura."* con un
  botón "Recargar ahora" (`window.location.reload()`).
- A propósito **no** se fuerza el reload automáticamente ni se limpia el
  `user` en memoria de inmediato — se eligió avisar en vez de interrumpir de
  golpe, para no borrar texto sin guardar en un formulario abierto en la
  pestaña vieja. El costo de este trade-off: entre que aparece el banner y
  que la persona hace clic en "Recargar ahora", esa pestaña sigue en el
  estado descrito arriba (UI vieja, pero requests ya autenticados como la
  cuenta nueva) — el aviso reduce la ventana y la hace visible, no la
  elimina por completo.
