# Plan: solución de fondo para autorización de endpoints

Documento de diseño, todavía no implementado — pensado para retomar con
calma. Fecha: 2026-09-12. Complementa a
`auditoria-permisos-endpoints-backend.md` (el diagnóstico) con la solución
propuesta.

## Contexto: por qué hace falta esto

La auditoría encontró que hoy conviven 4 mecanismos de autorización
desconectados entre sí:

1. `JwtAuthGuard` — valida que el JWT sea válido y el rol esté en una
   whitelist de 9 roles. Aplicado a mano, controller por controller (o
   peor, método por método).
2. `@Roles(...)` + `RolesGuard` — filtro adicional opcional, con nombres de
   rol quemados en el código. Confirmado que **no se usa en ningún
   controller real hoy** — existe pero está muerto.
3. `pc_modulos` / `pc_rol_modulo` — dos tablas de base de datos con
   permisos finos por rol×módulo (`rm_ver`/`rm_crear`/`rm_editar`/
   `rm_eliminar`/`rm_aprobar`). Solo se usan para armar el **menú**
   (`modulos.service.ts`), no protegen ningún endpoint.
4. `ModulePermissionGuard` + `@RequierePermiso(ruta, accion)` — construido
   específicamente para conectar el punto 3 con la autorización real de
   endpoints (consulta `pc_rol_modulo` vía `PermissionsService`). **Existe,
   compila, pero no está registrado en `app.module.ts` ni se usa en ningún
   controller.** Código muerto, nunca conectado.

Resultado real en producción: `MaestrosController` expone toda la base de
datos sin login; un CLIENTE autenticado puede aprobar/rechazar solicitudes
de crédito ajenas, fijar su propio cupo, o crear un usuario ADMIN. El
detalle completo, con archivo:línea de cada caso, está en
`auditoria-permisos-endpoints-backend.md`.

## Dos hallazgos de la investigación que definen el diseño

**1. No existe ningún guard global.** `app.module.ts` no tiene la clave
`providers` en su `@Module({...})` raíz — nunca se registró nada con
`APP_GUARD`. Por eso todo depende de que cada quien se acuerde de poner su
guard a mano. Inventario real de los 44 controllers del backend:

- **27 controllers** tienen `@UseGuards(JwtAuthGuard)` a nivel de clase —
  bien protegidos hoy.
- **4 controllers** tienen el guard puesto método por método, sin guard de
  clase — el peor patrón, porque un método nuevo puede nacer sin guard sin
  que nadie lo note. El peor caso es `solicitudes.controller.ts`, con **34
  líneas individuales** de `@UseGuards(JwtAuthGuard)` repetidas. Los otros
  tres son `auth.controller.ts`, `pqrs.controller.ts` y
  `formulario-preguntas.controller.ts`.
- **8 controllers reales, montados en la app que corre hoy, no tienen
  ningún guard**: `maestros`, `centros-operacion`, `consecutivos`,
  `motivos-rechazo`, `carta-pdf-vinculacion`, `dias-respuesta`,
  `tipos-vigencia`, `tipos-documentos`.
- (Aparte hay controllers con el mismo problema pero que no son
  alcanzables hoy porque su módulo no está importado en `app.module.ts`:
  `documentos.controller.ts`, dos controllers vacíos de `workflow/`, y
  `formulario/respuestas/respuestas.controller.ts`. No son urgentes, pero
  quedan como trampa si algún día se activan sin revisar esto primero.)

**2. El mecanismo del punto 4 (`ModulePermissionGuard`) ya está bien
diseñado, y los datos de `pc_rol_modulo` ya son correctos donde se
probaron** — no hace falta rediseñar nada ni repoblar la tabla desde cero.
Verificado en vivo contra la base de datos real, para el módulo
`/solicitudes/gestion-comite-credito-2`:

| Rol | ver | crear | editar | eliminar | aprobar |
|---|---|---|---|---|---|
| ADMIN | ✓ | | | | |
| CLIENTE | | | | | |
| COMITE CREDITO 2 | ✓ | ✓ | ✓ | ✓ | ✓ |
| (resto de roles) | | | | | |

Exactamente lo que uno esperaría: solo Comité de Crédito 2 puede aprobar
ahí, ADMIN solo puede ver, nadie más tiene nada. El problema nunca fue el
diseño ni los datos — fue que nadie conectó el guard que los lee.

También se confirmó cómo funciona `PermissionsService.tienePermiso`
(`src/permissions/permissions.service.ts`), que es la pieza que haría el
trabajo real:

- Resuelve el/los rol(es) del usuario: si es CLIENTE, fijo por código en
  `pc_roles`; si es usuario interno, todos sus roles activos en
  `pc_usuario_rol` (soporta multi-rol); si esa tabla no tiene nada, cae de
  vuelta al rol del JWT como red de seguridad.
- Compara la ruta pedida contra `pc_modulos.mod_ruta` con **igualdad
  exacta de string** (no hay `LIKE` ni normalización) — hay que usar la
  ruta tal cual está en la tabla.
- Si el usuario tiene varios roles, basta con que **uno** de ellos dé el
  permiso.
- Ya maneja el caso de rutas duplicadas en `pc_modulos` (hay algunas,
  dato sucio conocido) prefiriendo la fila raíz — aunque esto tiene un
  hueco puntual detallado más abajo (caso de `/parametrizacion/clientes`).

Y se confirmó el mecanismo paralelo que sí funciona hoy pero por fuera de
este sistema: `src/auth/roles.guard.ts` + `@Roles(...)` — mismo patrón
técnico (`Reflector`+`SetMetadata`), pero comparando un solo string de rol
contra una whitelist quemada en el código, sin soportar multi-rol. **No
tiene ni un solo uso real en ningún controller** — es la segunda pieza de
código muerto, además de `ModulePermissionGuard`.

## Objetivo

Que sea **estructuralmente imposible** que un endpoint nuevo quede sin
protección por descuido (hoy es el comportamiento por defecto: sin guard =
abierto), y que los permisos finos que ya existen en `pc_rol_modulo`
gobiernen de verdad las acciones críticas del sistema, no solo qué botón
se ve en el menú.

## Enfoque propuesto: 3 olas, cada una desplegable y verificable por separado

Deliberadamente incremental — es código de autenticación en producción, no
es prudente cambiarlo todo de un solo commit.

### Ola 1 — Guard global de autenticación

El cambio de mayor impacto con menor esfuerzo: cierra de un solo golpe
**todos** los "sin guard alguno" (el hallazgo más grave, `Maestros`,
incluido).

1. Nuevo `src/auth/public.decorator.ts` con un decorator `@Public()` (vía
   `SetMetadata`, mismo patrón que `@Roles`/`@RequierePermiso`) para marcar
   a propósito los pocos endpoints que deben quedar sin sesión (login,
   forgot-password, reset-password).
2. `src/auth/jwt-auth.guard.ts`: que revise primero, con `Reflector`, si el
   endpoint tiene `@Public()` — si sí, deja pasar de inmediato sin tocar el
   resto de su lógica actual (verificación de JWT, rol, versión de
   sesión).
3. `src/app.module.ts`: agregar la clave `providers` (hoy no existe) con
   `{ provide: APP_GUARD, useClass: JwtAuthGuard }` — esto lo activa para
   **toda** la aplicación, sin tener que tocar los 44 controllers uno por
   uno.
4. Marcar `@Public()` en los 3 endpoints de `auth.controller.ts` que
   deben quedar así (login, forgot-password, reset-password).
5. Los `@UseGuards(JwtAuthGuard)` que ya existen en 27+4 controllers no
   hay que tocarlos — quedan redundantes pero inofensivos; limpiarlos es
   cosmético, no urgente.

**Qué cierra esto por sí solo**: `Maestros` (el más grave — expone la BD
completa), `centros-operacion`, `consecutivos`, `motivos-rechazo`,
`carta-pdf-vinculacion`, `dias-respuesta`, `tipos-vigencia`,
`tipos-documentos`, y toda la parte de `solicitudes.controller.ts` que hoy
no tiene ni siquiera `JwtAuthGuard` (colas internas de OC/CC1/CC2/ASC,
detalle de cualquier solicitud, su PDF, tablas KYC, y
`POST /solicitudes/respuestas`).

**Lo que esta ola NO arregla todavía**: un CLIENTE con sesión válida sigue
pudiendo aprobar solicitudes ajenas o crearse un usuario ADMIN — eso
requiere permisos por rol/acción, no solo "estar logueado". Eso es la Ola
2.

**Riesgo a vigilar al desplegar**: revisar los 4 controllers de guard
"mezclado" (`auth`, `pqrs`, `solicitudes`, `formulario-preguntas`) por si
algún método individual dependía silenciosamente de quedar sin guard a
propósito — no se encontró ningún caso así en la investigación, pero vale
la pena reconfirmar antes de desplegar a producción.

### Ola 2 — Permisos finos en los endpoints críticos

`ModulePermissionGuard` + `@RequierePermiso(ruta, accion)` son "opt-in": un
endpoint sin el decorator sigue pasando igual que hoy. Esto permite
activarlo globalmente sin que rompa nada, y luego ir endpoint por endpoint
sin tener que terminar de mapear los 44 controllers de una sentada.

1. Registrar el segundo guard global en `app.module.ts`, **después** del
   de la Ola 1 (el orden en el array de `providers` importa: necesita
   `request.user` ya puesto por `JwtAuthGuard`).
2. Decorar, uno por uno, los endpoints de la lista crítica de la
   auditoría, reusando rutas de `pc_modulos` ya verificadas como
   correctas — no hace falta tocar datos para la mayoría:

| Controller / endpoint | Permiso a exigir |
|---|---|
| `solicitudes.controller.ts::concepto-comite-credito-2` | `/solicitudes/gestion-comite-credito-2`, `aprobar` |
| `...::concepto-comite-credito-1` | `/solicitudes/gestion-comite-credito-1`, `aprobar` |
| `...::concepto-oficial-cumplimiento` | `/solicitudes/gestion-oficial-de-cumplimiento`, `aprobar` |
| `...::concepto-servicio-cliente` | `/solicitudes/gestion-auxiliar-servicio-al-cliente`, `aprobar` |
| `usuario.controller.ts` (crear/editar/borrar) | `/seguridad/usuarios`, `crear`/`editar`/`eliminar` |
| `usuario-roles.controller.ts` (asignar/quitar) | `/seguridad/usuario-roles`, `crear`/`eliminar` |
| `roles.controller.ts` (CRUD + asignar módulos) | `/seguridad/roles`, `crear`/`editar`/`eliminar` |
| `clientes.controller.ts` (crear/editar/borrar) | `/parametrizacion/clientes`, `crear`/`editar`/`eliminar` — ver nota abajo |
| `formulario-preguntas.controller.ts` (crear/editar/borrar) | `/parametrizacion/formulario-preguntas`, `crear`/`editar`/`eliminar` |
| `pqrs.controller.ts::update/asignar` | `/pqrs/bandeja`, `editar` |
| `ampliacion-cupo.controller.ts` (editar/borrar) | `/solicitudes/solicitud-ampliacion-cupo`, `editar`/`eliminar` |
| `modulos.controller.ts` (CRUD del menú) | `/seguridad/modulos`, `crear`/`editar`/`eliminar` |

**Nota — dato sucio a arreglar antes de depender de `/parametrizacion/clientes`**:
existen 2 filas en `pc_modulos` con esa misma ruta (`mod_id` 51 y 92,
ambas hijas del mismo padre), y la lógica de desempate de `tienePermiso`
solo prioriza correctamente cuando una de las dos filas duplicadas es
"raíz" (`mod_padre_id IS NULL`) — acá ninguna lo es, así que el resultado
podría ser no determinístico. Se necesita una migración chica para
desactivar o fusionar el duplicado antes de decorar ese controller.

**Casos especiales, sin mapeo directo a un módulo existente**:

- **`MaestrosController`**: nunca tuvo entrada de menú (es herramienta de
  debug). No vale la pena crearle un módulo — más simple restringirlo con
  `@Roles('ADMIN')` (revive `RolesGuard` solo para este caso puntual) y,
  si es posible, condicionarlo también a que no corra en producción
  (`NODE_ENV !== 'production'`) — es una herramienta de desarrollo, no una
  función de negocio real.
- **`carta-pdf-vinculacion.controller.ts`**: antes de decorarlo, confirmar
  si sigue en uso — ya se identificó que esta función se fusionó dentro de
  `tipos-documentos` en una migración posterior
  (`20260727_unificar_carta_vinculacion_en_tipos_documentos.sql`, ver
  `Funcionalidades/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md`).
  Puede que este controller ya sea código legado que convenga retirar en
  vez de proteger.
- **`tipos-vigencia.controller.ts`**: no tiene fila propia en
  `pc_modulos`. Si sigue en uso, hay que crearle una (hija de
  `/parametrizacion`) antes de decorarlo.
- **`solicitudes.controller.ts::aprobacion` / `:id/estado` /
  `resultado-pendiente` / `estado-flujo(-automatico)`**: no está claro que
  deban mapear a un módulo — parecen anteriores a que existieran los
  endpoints específicos por etapa (`concepto-comite-*`, etc.). Antes de
  decorarlos, confirmar con el frontend si siguen en uso real; si son
  remanentes, lo correcto sería retirarlos, no protegerlos.
- **`condiciones-financieras.controller.ts`, `notificaciones.controller.ts`**
  (envío de credenciales/condiciones): no tienen pantalla/módulo propio —
  son acciones disparadas desde otra pantalla. El mapeo natural es heredar
  el permiso del módulo que dispara la acción (ej. enviar condiciones tras
  aprobar CC2 hereda el mismo permiso que aprobar en CC2).

3. Cada endpoint decorado se prueba con `mint-jwt.mjs` para 2-3 roles
   representativos antes de seguir con el siguiente — cada decorator es un
   cambio aislado y reversible, no hace falta terminar la lista completa
   para empezar a desplegar.

### Ola 3 — que no se pueda repetir

Las olas 1 y 2 arreglan el estado actual. Sin esto, el próximo endpoint
nuevo puede volver a nacer sin protección exactamente igual que hoy — el
mismo patrón de "se te olvida un paso" que ya se ve en
`menu-dinamico-pc-modulos.md` para el menú, pero aplicado a seguridad real.

- Retirar `@Roles`/`RolesGuard` como mecanismo válido para código nuevo —
  que quede solo como la excepción documentada de `Maestros`, para no
  volver a tener dos patrones de permiso compitiendo.
- Agregar una verificación automática (test o script, corrido en CI) que
  recorra los controllers y falle si encuentra un método
  `@Post`/`@Put`/`@Patch`/`@Delete` sin `@RequierePermiso` **ni**
  `@Public()`. Esto es lo que hace la diferencia entre "otro parche
  puntual" y una solución de fondo: convierte "se me olvidó proteger esto"
  de un silencio en producción a un build que no pasa.
- Limpiar los `@UseGuards(JwtAuthGuard)` redundantes que quedan de antes de
  la Ola 1 (cosmético, no bloqueante).

## Archivos que cambiarían

- `src/auth/public.decorator.ts` — nuevo.
- `src/auth/jwt-auth.guard.ts` — chequeo de `@Public()`.
- `src/app.module.ts` — agregar `providers` con los 2 `APP_GUARD`.
- `src/auth/auth.controller.ts` — `@Public()` en login/forgot/reset.
- `src/maestros/maestros.controller.ts` — `@Roles('ADMIN')` + gate por
  `NODE_ENV`.
- Cada controller de la tabla de la Ola 2 — agregar `@RequierePermiso(...)`
  en los métodos de mutación listados.
- Migración SQL chica para el duplicado de `/parametrizacion/clientes`.
- Nuevo test/script de CI para la Ola 3.

## Cómo se verificaría cada ola

1. **Ola 1**: con el backend corriendo, `curl` sin token a
   `GET /api/maestros/catalogo-esquema?mode=databases` debe pasar de `200`
   a `401`. Repetir en 2-3 controllers más de la lista sin guard.
   Confirmar que `POST /api/auth/login` real sigue funcionando (que un
   endpoint público empiece a dar `401` sería la señal de que algo salió
   mal). Confirmar el frontend real de punta a punta (login, navegar
   varias páginas), no solo `tsc --noEmit`.
2. **Ola 2**, por cada endpoint: `node scripts/mint-jwt.mjs CLIENTE 13606`
   y `node scripts/mint-jwt.mjs <rol correcto>`, `curl` contra el endpoint
   real con cada uno — confirmar `403` para el que no debe, `200`/`204`
   para el que sí. `/solicitudes/gestion-comite-credito-2` es el más
   rápido de confirmar primero porque sus datos en `pc_rol_modulo` ya están
   verificados como correctos.
3. **Ola 3**: correr el test/script nuevo contra el estado actual del
   repo — debe fallar señalando los endpoints todavía sin migrar (esa
   lista de fallos ES la checklist pendiente), y se va poniendo en verde a
   medida que se decora cada uno.

## Estado

**Olas 1 y 2 implementadas y verificadas en vivo (2026-09-12)**, contra el
backend real corriendo en dev (`localhost:4003`) — no solo `tsc --noEmit`.

### Ola 1 — hecha
`src/auth/public.decorator.ts` creado, `JwtAuthGuard` chequea `@Public()`
vía `Reflector`, registrado como `APP_GUARD` en `app.module.ts`, y
`auth.controller.ts` marca `login`/`forgot-password`/`reset-password` como
públicos. Verificado con `curl`: `GET /maestros/catalogo-esquema` y
`GET /centros-operacion` pasaron de `200` a `401` sin token; login sigue
funcionando; un JWT válido sigue autenticando en endpoints viejos y nuevos.

### Ola 2 — hecha para la lista crítica original, con hallazgos nuevos
`ModulePermissionGuard` registrado como segundo `APP_GUARD` (después del de
Ola 1). Decorados con `@RequierePermiso(ruta, accion)` y verificados con
`mint-jwt.mjs` + `curl` (CLIENTE bloqueado con 403, rol correcto pasa el
permiso):

- `solicitudes.controller.ts`: los 4 endpoints `concepto-*` por etapa.
- `usuario.controller.ts`: `findAll`/`findOne`/`create`/`update`/`remove`.
- `usuario-roles.controller.ts`: los 4 endpoints.
- `modules/seguridad/roles/roles.controller.ts` y `seguridad/seguridad.controller.ts`
  (las dos superficies duplicadas de roles — **hallazgo nuevo**: hay
  también una tercera ruta real y alcanzable, `/api/api/seguridad/roles`,
  por un `@Controller('api/seguridad/roles')` que se suma al prefijo
  global `api` — quedó decorada igual).
- `clientes.controller.ts`: `create`/`update`/`delete` (se confirmó que el
  duplicado de `pc_modulos` para esta ruta, mod_id 51, no tiene ninguna
  fila en `pc_rol_modulo` — no genera ambigüedad hoy, se dejó así en vez de
  migrar).
- `formulario-preguntas.controller.ts`: pregunta y opciones (6 endpoints).
- `pqrs.controller.ts`: `update`/`asignar`.
- `ampliacion-cupo.controller.ts`: `update`/`remove`.
- `modulos.controller.ts`: `create`/`update`/`remove`/`activate` (`por-rol`
  se dejó sin permiso a propósito — lo necesita cualquier rol para pintar
  su propio menú).
- `condiciones-financieras.controller.ts` y
  `notificaciones.controller.ts::enviarCondiciones/enviarCredencialesUsuario`:
  heredan el permiso del módulo que los dispara, como proponía el plan.

**`MaestrosController`, con un ajuste sobre el plan original**: no se
restringió todo el controller a ADMIN — se confirmó que `getCatalogo`
(y `getPaises`/`getDepartamentos`/`getCiudades`/`getCatalogoDocumentos`) sí
los usa el formulario real de solicitudes (`useCatalogoDependiente.ts`,
`TablaField.tsx`) para preguntas tipo catálogo, incluido CLIENTE. Solo
`getCatalogoEsquema` (el navegador de esquema — bases/tablas/columnas) se
restringió a `@Roles('ADMIN')` + bloqueado en `NODE_ENV=production`,
confirmado que ninguna página del frontend lo consume.

### Continuación (2026-09-13) — el resto de los pendientes, resuelto

- **`tipos-documentos`, `dias-respuesta`, `motivos-rechazo`**: decorados.
  Único detalle no obvio: la ruta real en `pc_modulos` para
  `tipos-documentos.controller.ts` es `/parametrizacion/documentos` (mod_id
  78), **no** `/parametrizacion/tipos-documentos` como el path del
  controller — se usó la ruta de la BD, no la del controller.
- **`carta-pdf-vinculacion.controller.ts` y `tipos-vigencia.controller.ts`**:
  se confirmó que ambos siguen con página propia activa en el frontend (no
  eran legado). Se creó la migración
  `migrations/20260913_crear_modulos_carta_vinculacion_y_tipos_vigencia.sql`
  (patrón idempotente `IF NOT EXISTS`, igual que las migraciones previas de
  módulos) agregando ambos como hijos de Parametrización con permiso
  completo solo para ADMIN, y ya quedaron decorados.
- **Los 4 endpoints genéricos de `solicitudes.controller.ts`** — investigados
  uno por uno contra el frontend real:
  - `PUT :id/aprobacion`: confirmado que el único llamador real es
    `gestion-auxiliar-servicio-al-cliente/[id]/gestionar/page.tsx` — es la
    aprobación de ASC. Decorado con el mismo módulo que
    `concepto-servicio-cliente`.
  - `PUT :id/estado-flujo` y `PUT :id/estado-flujo-automatico`: confirmado,
    por grep exhaustivo, que **ningún** page/hook/componente del frontend
    los llama hoy — permiten forzar estado/etapa/resultado saltándose el
    motor de transiciones. Sin un caller real que dicte el rol correcto,
    se restringieron a `@Roles('ADMIN')` en vez de dejarlos abiertos a
    cualquier autenticado.
  - `PATCH :id/estado` y `PATCH :id/resultado-pendiente`: confirmado que
    los llama el propio **CLIENTE**, dentro de
    `solicitudes.service.ts::guardarSolicitud` (enviar una solicitud nueva,
    y reenviar tras una corrección pedida por ASC). Es autoservicio sobre
    el propio recurso, no una acción administrativa — se dejaron sin
    `@RequierePermiso` a propósito, marcados con el nuevo decorator
    `@SoloAutenticado()` (`src/auth/solo-autenticado.decorator.ts`) para
    que el guardrail de Ola 3 los reconozca como "revisado y dejado así",
    no como un gap sin revisar.
- **Ola 3 — hecha**: `scripts/check-permisos-endpoints.mjs` escanea todos
  los `*.controller.ts` y detecta cualquier `@Post/@Put/@Patch/@Delete` sin
  `@RequierePermiso`/`@Public`/`@Roles`/`@SoloAutenticado`. Usa un
  "baseline" (`scripts/permisos-endpoints-baseline.json`, generado con
  `npm run check:permisos:baseline`) para no bloquear en la deuda ya
  conocida — 40 endpoints repartidos en el resto del backend que nunca se
  tocó en esta pasada (`documentos`, `correos-por-rol`, `estados`,
  `formulario-secciones`, `formularios`, `pqrs` comentarios/adjuntos,
  varios de `solicitudes` como soportes-analisis/evidencias-persona, y
  varios de autoservicio en `usuarios` como change-password/centros) —
  solo falla (`npm run check:permisos`, exit code 1) si aparece un endpoint
  **nuevo** no presente en el baseline. Probado en vivo: se agregó
  temporalmente un endpoint sin decorar y el script lo detectó
  correctamente antes de revertirlo.

### Verdaderamente pendiente ahora

Los 40 endpoints del baseline de Ola 3 (ver
`scripts/permisos-endpoints-baseline.json` para la lista exacta) — deuda
conocida y ahora *contenida* (no puede crecer sin que el chequeo lo note),
pero no arreglada. Requieren el mismo tipo de investigación caso por caso
que se hizo hoy para no adivinar mal el rol/permiso correcto.
