# Flujo de "Ampliación de cupo" — estado actual (2026-07-13)

Hay **dos caminos distintos** para que una ampliación de cupo termine
existiendo en el sistema. Los dos terminan en el mismo lugar (una fila más
en `solicitudes`, con las mismas 5 etapas de aprobación de siempre), pero
arrancan de forma diferente.

## Esquema de datos

No existe ninguna tabla `ampliacion_cupo` separada. Todo vive en la propia
tabla `solicitudes`, en dos columnas agregadas por la migración
`BACKEND/migrations/20260719_agregar_cupo_solicitado_a_solicitudes.sql`:

- `sol_cupo_solicitado` (`decimal(18,2)`, nullable) — el monto pedido.
- `sol_justificacion_ampliacion` (`nvarchar(max)`, nullable) — el motivo.

Una solicitud "es una ampliación de cupo" si `sol_cupo_solicitado IS NOT
NULL`. No hay ninguna otra marca especial: mismas columnas de etapa
(`sol_etapa_actual_id`), estado (`sol_estado_id`) y resultado
(`sol_resultado_etapa_id`) que cualquier otra solicitud — ver
`BACKEND/FLUJO_ETAPAS.md`.

(Antes hubo una `AmpliacionCupoEntity`/tabla `ampliacion_cupo` planeada,
pero se descartó por redundante — sus otros campos eran copias de
`solicitudes` que quedaban desactualizadas. Detalle de esa decisión en
`documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md`.)

## Camino 1: el cliente la genera solo (autodetección)

No es un flujo separado — es la misma "Nueva solicitud" de siempre
(`FRONTEND/src/app/solicitudes/nueva`), con un único cambio: la pregunta
**"Tipo de solicitud"** (`Formulario_pregunta.fp_id = 1171`, `fp_codigo =
'TIPO_SOLICITUD'`) se preselecciona sola.

Mecanismo (`SolicitudFormContent.tsx`):

1. Al abrir "Nueva solicitud" como CLIENTE, el hook `useUltimaSolicitud`
   trae la última solicitud de `user.cliente_id`.
2. `tieneSolicitudesPrevias = ultimaSolicitud !== null` — basta con que
   exista cualquier solicitud anterior, sin importar su estado (borrador,
   pendiente, revisión, aprobada o **rechazada** — ver nota abajo).
3. Se sobreescribe la respuesta de la pregunta 1171: sin solicitudes
   previas → "Cliente Nuevo"; con alguna previa → "Ampliación de Cupo". La
   pregunta queda en modo lectura (el cliente no la edita a mano).

A partir de ahí es una solicitud normal de punta a punta: mismo formulario
completo, mismos documentos, mismas 5 etapas (Ejecutivo de Negocios →
Auxiliar Servicio Cliente → Oficial de Cumplimiento → Comité de Crédito 1 →
Comité de Crédito 2). El backend no tiene ninguna rama especial para este
caso — es solo una etiqueta preseleccionada en el formulario. `sol_cupo_solicitado`/
`sol_justificacion_ampliacion` **no se llenan por este camino** (son
específicos del camino 2) — este camino usa las preguntas normales del
formulario para capturar el nuevo cupo pedido.

**Detalle a tener en cuenta**: la condición es solo "existe una solicitud
anterior", sin filtrar por estado. Un cliente cuya única solicitud previa
fue **rechazada** también ve preseleccionado "Ampliación de Cupo" aunque
nunca haya tenido un cupo aprobado. No bloquea ni cambia el flujo, pero
puede ser confuso para quien revisa la solicitud después.

## Camino 2: el Ejecutivo de Negocios la inicia

Página dedicada `FRONTEND/src/app/solicitudes/solicitud-ampliacion-cupo`
(hasta el 2026-07-13 se llamaba `-ejn` y estaba **desconectada** — tabla
inexistente, sin guard de autenticación, columna de historial mal escrita.
Se corrigió y verificó en vivo esta sesión; sigue **sin enlace en ningún
menú**, solo alcanzable por URL directa).

Flujo (`AmpliacionCupoService.create()` en
`BACKEND/src/ampliacion-cupo/ampliacion-cupo.service.ts`):

1. El Ejecutivo selecciona un cliente. El selector (`GET
   /clientes/aprobados`) solo muestra clientes con al menos una solicitud
   con `sol_estado_id = 5` (APROBADA en la tabla real `solicitud_estados`
   — no confundir con `FRONTEND/src/constants/estado-solicitud.ts`, que
   hasta el 2026-07-13 tenía este id mal).
2. `verificarDocumentosVencidos(clienteId)` revisa si la última solicitud
   del cliente tiene documentos vencidos (`Solicitud_archivo.sa_fecha_vencimiento`).
   - **Sin vencidos** → la nueva solicitud se crea directo en etapa
     **Oficial de Cumplimiento** (`sol_estado_id = 3` REVISION), saltándose
     Ejecutivo de Negocios y Auxiliar Servicio Cliente — porque ya se
     verificó que los documentos administrativos siguen vigentes.
   - **Con vencidos** → se crea en etapa **Cliente** (`sol_estado_id = 2`
     PENDIENTE), para que el cliente vuelva a subir lo vencido antes de
     seguir.
3. Se inserta la fila en `solicitudes` (con `sol_cupo_solicitado` y
   `sol_justificacion_ampliacion` ya poblados desde el formulario de esta
   página) y se registra en `solicitud_workflow_historial`.
4. De ahí en adelante sigue el mismo camino que cualquier solicitud en esa
   etapa — no hay tratamiento especial más allá del punto de entrada.

**Pendiente, no implementado todavía** (anotado en
`documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md`,
sección 4): el chequeo de "documentos vencidos" hoy mira
`Solicitud_archivo` (documentos de la última solicitud puntual). La idea
acordada es que mire en cambio un archivo "definitivo" del cliente
(`Cliente_archivo`, tabla todavía no creada) que se promueve al aprobarse
una solicitud en Comité de Crédito 2 — así el Ejecutivo puede iniciar la
ampliación sin pedirle nada al cliente si sus documentos siguen vigentes,
sin importar en qué solicitud puntual se subieron originalmente. Mientras
`Cliente_archivo` no exista, este camino sigue funcionando, solo que mira
la solicitud anterior en vez del archivo consolidado del cliente.

**Enlace al menú**: sigue pendiente (paso 4 del checklist en el documento
del plan) — hoy la página funciona pero no aparece en ningún menú del
Ejecutivo de Negocios.

## Gotchas ya resueltos esta sesión (para no repetirlos)

- El INSERT a `solicitud_workflow_historial` usaba una columna que no
  existe (`swh_solicitud_id` en vez de `swh_sol_id`) y le faltaba
  `swh_usuario_id` (NOT NULL sin default) — corregido.
- El controller no tenía `@UseGuards(JwtAuthGuard)` — cualquiera podía
  llamar `POST /ampliacion-cupo` sin token. Corregido; requirió también
  importar `AuthModule` en `AmpliacionCupoModule` (provee `JwtService`).
- `FRONTEND/src/constants/estado-solicitud.ts` tenía mal los ids de
  `APROBADA`/`RECHAZADA`/`CANCELADA` frente a la tabla real
  `solicitud_estados` — corregido (ver `documentacion/modulos-generales-del-proyecto.md`
  si se agrega ahí una entrada de catálogos, o el archivo mismo para el
  detalle).
