# El JWT reutiliza `usr_id` para significar `cli_id`: 3 columnas rotas y un bloqueo incompleto (2026-08-02)

## Contexto

Reportado por el usuario probando "Nueva solicitud" en vivo como cliente
(David Prueba 3, cli_id 13607): `Guardar Borrador` falló con
`FOREIGN KEY constraint "FK_solicitudes_usuario_crea"`. La investigación
encontró el mismo patrón repetido en 4 lugares distintos del código, todos
con la misma causa raíz.

**Causa raíz**: el payload del JWT reutiliza el campo `usr_id` para el id de
quien sea que esté logueado (`AuthService.loginCliente`,
`BACKEND/src/auth/auth.service.ts`): para un usuario interno es un
`usuarios.usr_id` real, pero para un cliente es en realidad su `cli_id`
(`payload.usr_id = cli.cli_id`). Cualquier código que tome ese valor tal
cual y lo escriba en una columna con FK real hacia `Usuarios` revienta con
un cliente logueado, porque su "usr_id" nunca existe en esa tabla.

Migración de auth a cookie httpOnly (mismo día, ver
`documentacion/migracion-auth-httponly.md`) no causó esto — el payload del
JWT es idéntico sin importar si viaja por header o por cookie. Es un bug
preexistente que simplemente nunca se había probado a fondo con una cuenta
cliente hasta esta sesión.

## 1. Frontend: `Guardar Borrador` no filtraba por tipo de usuario

**Archivo**: `FRONTEND/src/app/solicitudes/nueva/SolicitudFormContent.tsx`,
función `handleGuardarParcial`.

**Síntoma**: mandaba `user.usr_id` sin condición a
`solicitudesService.guardarBorrador(...)`, que lo reenvía como
`usuario_crea` en el body de `POST /solicitudes`. El flujo de "Enviar"
(`confirmarGuardar`, misma pantalla) ya tenía el chequeo correcto
(`isClienteUser ? null : user.usr_id`) desde antes — solo el de Borrador se
quedó sin él.

**Fix**: mismo chequeo `isClienteUser ? null : user.usr_id` en
`handleGuardarParcial`. Requirió ampliar el tipo de
`solicitudesService.guardarBorrador` (`FRONTEND/src/services/solicitudes.service.ts`)
de `usuarioId: number` a `usuarioId: number | null`.

## 2. Backend: 3 endpoints de cambio de estado escribían `usr_id` de cliente en `sol_usuario_modifica`

**Archivo**: `BACKEND/src/solicitudes/solicitudes.controller.ts`.

**Síntoma**: `PATCH :id/estado`, `PATCH :id/resultado-pendiente` y
`PATCH :id/documentos-diferidos/verificar` hacían
`const usuarioId = req.user?.usr_id || req.user?.id;` sin mirar
`req.user.tipo`, y lo pasaban directo a `SolicitudesWorkflowService`, que lo
escribe en `solicitudes.sol_usuario_modifica` (FK a `Usuarios`). Reproducido
en vivo: al avanzar la solicitud del cliente de prueba con
"Enviar e informar a Cartonera" (que llama a
`verificarYAvanzarDocumentosPlantilla`, el mismo bug).

**Fix**: helper nuevo en el controller,
`resolverUsuarioIdParaAuditoria(user)` — devuelve `null` si
`user.tipo === 'cliente'`, si no `user.usr_id || user.id`. Usado en los 3
endpoints en vez del acceso directo a `req.user.usr_id`.

## 3. Efecto colateral del fix 2: dos tablas de historial son `NOT NULL` sin default

**Archivo**: `BACKEND/src/solicitudes/solicitudes-workflow.service.ts`.

**Síntoma**: al pasar `usuarioId = null` para un cliente (fix 2), la
siguiente escritura rompió con
`Cannot insert the value NULL into column 'seh_usr_id'`. A diferencia de
`sol_usuario_modifica` (nullable), estas dos columnas no lo son y no tienen
default:

- `Solicitudes_estados_hist.seh_usr_id`
- `solicitud_workflow_historial.swh_usuario_id`

**Fix**: variable local `usuarioIdParaHistorial = usuarioId ?? 1` (o
`usuarioId ?? 1` inline donde aplicaba), usada solo para esas dos
inserciones — `sol_usuario_modifica` se queda en `null` de verdad. Mismo
criterio de fallback a `1` (Administrador) que ya usaba
`SolicitudesService.crearSolicitud` para su propio insert en
`Solicitudes_estados_hist`. Tocó `cambiarEstado`,
`actualizarResultadoPendiente` y `verificarYAvanzarDocumentosPlantilla` —
las mismas 3 funciones detrás de los endpoints del fix 2.

**Nota**: `sa_cargado_por` (`Solicitud_archivo`, quién subió un documento)
tiene el mismo problema de fondo (guarda el `usr_id`-que-en-realidad-es-
`cli_id` de un cliente sin filtrar) pero **no revienta nada** — se verificó
contra la BD real que esa columna no tiene ninguna foreign key. Es un dato
"sucio" (no apunta a un `usuarios.usr_id` real), no un bug funcional. No se
tocó.

## 4. El bloqueo de "una sola solicitud activa por cliente" solo vivía en el frontend

**Archivo**: `BACKEND/src/solicitudes/solicitudes.service.ts`, función
`crearSolicitud`.

**Síntoma**: encontrado al revisar por qué el cliente de prueba terminó con
dos solicitudes activas a la vez (`sol_id=2200` en PENDIENTE y `sol_id=2202`
en REVISIÓN, esta última procesada por cuentas internas reales sin relación
con la sesión de prueba). El backend **solo bloqueaba duplicados en
BORRADOR** (`sol_estado_id = 1`):

```sql
WHERE sol_cliente_id = @0 AND sol_estado_id = 1
```

El bloqueo real de los 3 estados (BORRADOR/PENDIENTE/REVISIÓN) vivía
únicamente en el frontend (`SolicitudFormContent.tsx`, mirando
`useUltimaSolicitud`) — una validación de UI, saltable por cualquier camino
que no pase por ese formulario puntual (llamada directa a la API, otra
herramienta interna, etc.).

**Fix**: `crearSolicitud` ahora bloquea `sol_estado_id IN (1, 2, 3)`, mismo
criterio que ya usa `AmpliacionCupoService.create()` para el mismo problema
(`ESTADOS_EN_TRAMITE = [1, 2, 3]`). Mensaje de error indica el estado real
de la solicitud existente (borrador / pendiente / en revisión).

**No se tocó**: las dos solicitudes de prueba (`2200`, `2202`) que ya
existían con este problema — no se fusionaron ni eliminaron, quedan como
están. El fix solo previene casos nuevos hacia adelante.

## Verificación

- `tsc --noEmit` limpio en ambos repos después de cada fix.
- Cada fix se probó contra el backend local real (no mocks), reiniciando
  `nest start --watch` entre cambios (ver quirk `EADDRINUSE` documentado en
  `CLAUDE.md` — requirió el ciclo kill+restart limpio varias veces esta
  sesión).
- El usuario confirmó en vivo, en su propia sesión de pruebas, que
  "Guardar Borrador" y luego "Guardar y Enviar" funcionaron después de cada
  fix correspondiente.
- Commits: `B_PortalClientes@ce535ec`, `F_PortalClientes@07ac6d6`. Desplegado
  y confirmado en producción real (Render + Vercel, ambos respondiendo `200`
  tras el deploy).

## Nota aparte: rediseño visual de Auxiliar Servicio al Cliente (mismo día, sin relación con los bugs de arriba)

Pedido por el usuario al notar que
`FRONTEND/src/app/solicitudes/gestion-auxiliar-servicio-al-cliente/[id]/gestionar/page.tsx`
se veía distinta a las otras 4 pantallas de gestión (CC1, CC2, Oficial de
Cumplimiento, Ejecutivo de Negocios). Confirmado en código: esas 4 ya tenían
el "sistema visual nuevo" (`min-h-screen bg-gradient-to-b from-[#f6f8fc]
to-[#eef1f7]`, header con barra de degradado azul
`linear-gradient(120deg,#003d99...)`, `ESTADO_TOKENS` para el badge de
estado, `useHistorialWorkflow` para el historial) — ASC se había quedado con
el diseño viejo (`bg-gray-50` plano, sin la barra de header).

Se reescribió la pantalla completa con el mismo lenguaje visual, sin tocar
ninguna lógica: mismos handlers (`handleGuardarDecision`,
`handleConfirmGuardarDecision`, `obtenerUsuarioId`), mismo estado
(`GestionState`), misma validación (aprobar bloqueado si hay documentos
vencidos/marcados, rechazar exige al menos un documento marcado). Cambios
funcionales menores solo donde ya era el patrón establecido en las otras 4
pantallas:

- Historial: pasó de un fetch manual (`solicitudesService.obtenerHistorialWorkflow`
  + mapeo a mano) al hook compartido `useHistorialWorkflow`, igual que
  CC1/CC2/OFC.
- Badge de estado: pasó de una cadena de ternarios inline a `ESTADO_TOKENS`
  (constante compartida, ya usada por las otras 3 pantallas del comité).

Verificado con Playwright contra el navegador real (Chrome vía
`playwright-core`, login real, captura de pantalla de
`gestion-auxiliar-servicio-al-cliente/2200/gestionar`) — no solo compilado,
la pantalla se ve y funciona igual que las demás.

## Pendiente, no investigado esta sesión

- **Desfase de timezone en columnas `datetime`** (`sol_created_at`,
  `swh_fecha`, etc.) — encontrado de pasada mientras se investigaban las dos
  solicitudes duplicadas, no relacionado con los bugs de arriba. Anotado en
  `CLAUDE.md`, sección de gotchas. El usuario pidió dejarlo así por ahora.
- No se auditó el resto del backend en busca del mismo patrón
  (`req.user.usr_id` escrito directo en una columna con FK) fuera de
  `solicitudes.controller.ts` — solo se corrigieron los 3 endpoints donde se
  reprodujo el error en vivo.
