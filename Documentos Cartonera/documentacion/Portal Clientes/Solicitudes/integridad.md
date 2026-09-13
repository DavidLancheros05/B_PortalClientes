# Diagnóstico: llaves primarias, foráneas y unique — tablas de solicitudes y workflow

## Resumen en criollo (sin jerga técnica)

Este documento nació de una revisión de la base de datos que encontró varios problemas de
diseño en las tablas de "solicitudes": faltaban candados (nombre técnico: **FK / llave
foránea**) que aseguraran que un dato apuntara a algo que realmente existe — por ejemplo, que
`sol_cliente_id` (la columna que dice de qué cliente es la solicitud) realmente apuntara a un
cliente que existe en la tabla de clientes, y no a un número suelto sin verificar.

**Qué se corrigió el 2026-08-02:**
1. Se agregaron 12 de esos candados que faltaban (cliente, centro de operación, motivo de
   rechazo, y varios usuarios asociados a la solicitud).
2. En el camino se encontró que la tabla de "preguntas del formulario"
   (`Formulario_pregunta`) ni siquiera tenía un identificador único protegido — se le agregó.
3. Se limpiaron 3 solicitudes de prueba que tenían guardado el número del cliente en la
   columna de "quién la creó", en vez de dejarla vacía (que es lo correcto cuando el que crea
   la solicitud es el propio cliente, no un empleado).
4. Se quitaron 3 reglas de "no duplicados" que estaban repetidas dos veces por error
   (probablemente una migración vieja corrida dos veces sin darse cuenta).

**Qué cambió después (2026-09-12):** el "centro de operación" de las solicitudes
(`sol_co_id`, uno de los 12 candados agregados el 2026-08-02) se eliminó por completo —
resultó vestigial, no una corrección pendiente. Ver sección "🔄 Actualización 2026-09-12" más
abajo.

**Qué se cerró después (2026-09-13):** los 2 puntos técnicos que quedaron pendientes en agosto
ya se resolvieron — ver sección "✅ Resuelto 20260913" más abajo:
1. `swh_usuario_id`/`seh_usr_id` ya tienen su FK a `usuarios`. El bloqueo original (6 filas de
   prueba con un `cli_id` guardado ahí) ya no existía al revisar en vivo — se agregaron las FK
   directo, sin necesidad de la decisión de producto que se había planteado.
2. `Solicitud_documento_deprecated` se borró (0 referencias en código, decisión explícita del
   usuario de no archivar sino eliminar).

**No queda ningún pendiente técnico.** El único punto que seguía abierto,
`Solicitud_adjunto`/`Solicitud_desarrollo`, se confirmó (2026-09-13, muestreo en vivo) que son
tablas del **sistema comercial**, no del portal: `Solicitud_adjunto` es aprobación de planos de
muestra (`mues_id`, usuarios como `jorge.bermudez`/`ronald.cantoni`, PDFs de plano);
`Solicitud_desarrollo` es seguimiento de desarrollo de cliente (`ejng_id`/`cli_id`/`cop_id`,
fechas desde enero 2024, antes de que existiera el portal). Ninguna referencia `sol_id` hacia
las tablas de solicitudes de vinculación. No requieren ninguna acción — quedan documentadas
para que nadie las confunda con el dominio del portal.

El resto del documento (abajo) es el detalle técnico completo, con nombres exactos de tablas,
columnas y constraints, para quien necesite ese nivel de precisión.

## Detalle técnico

Revisión hecha en vivo contra la base de datos real (`sys.tables`, `sys.key_constraints`,
`sys.indexes`, `sys.foreign_keys`), no contra `DATABASE.md` (desactualizado desde mayo 2026).

Diagnóstico original: 2026-07-18. Revalidado en vivo el 2026-08-02 (ver sección "✅ Resuelto
20260721/20260722"). **Corregido en vivo el 2026-08-02** con la migración
`20260802_agregar_fk_faltantes_y_limpiar_unique_duplicados.sql` — ver sección "✅ Resuelto
20260802" más abajo. **Actualizado 2026-09-12**: una de las 12 FK de esa migración
(`sol_co_id → Centro_operacion`) fue eliminada, no es un problema pendiente — ver sección "🔄
Actualización 2026-09-12". **Corregido en vivo el 2026-09-13** con
`20260913_agregar_fk_usuario_historial.sql` y `20260913_eliminar_solicitud_documento_deprecated.sql`
— ver sección "✅ Resuelto 20260913". Solo queda 1 punto pendiente, por decisión de producto (no
de schema).

Tablas cubiertas: `solicitudes`, `Solicitud_archivo`, `Solicitud_soporte_analisis`,
`solicitud_workflow_historial`, `Solicitudes_estados_hist`, `solicitud_estados`,
`workflow_etapas`, `workflow_estado_etapa`, `Motivos_rechazo_solicitud`, `Formulario_pregunta`,
`param_dias_respuesta_solicitudes`, más el hallazgo colateral `Solicitud_adjunto`/
`Solicitud_desarrollo` (`Solicitud_documento_deprecated` cubierta hasta que se borró, ver "✅
Resuelto 20260913").

## ✅ Resuelto 20260721 / 20260722

- **`solicitudes` ya tiene llave primaria**: `PK_solicitudes` (clúster) en `sol_id`. Ya no es
  HEAP.
- **`sol_numero_solicitud` ya tiene UNIQUE** — en 20260722/20260802 era compuesto con
  `sol_co_id` (`UQ_numero_solicitud_centro`); desde 20260912 es un UNIQUE simple sobre
  `sol_numero_solicitud` solo (`UQ_solicitudes_numero_solicitud`) — ver "🔄 Actualización
  2026-09-12". Además hay un índice único filtrado `IDX_UQ_cliente_borrador` que impide más de
  una solicitud en estado BORRADOR por cliente.
- **6 FK nuevas** (`ON DELETE CASCADE`) desde las tablas hijas hacia `solicitudes(sol_id)`:
  `Formulario_respuesta.fr_solicitud_id`, `Solicitud_archivo.sa_sol_id`,
  `Solicitud_carta_vinculacion.scv_sol_id`, `Solicitud_soporte_analisis.ssa_sol_id`,
  `solicitud_workflow_historial.swh_sol_id`, `Solicitudes_estados_hist.seh_sol_id`.
- **Huérfanos limpiados** en `Solicitud_archivo`, `solicitud_workflow_historial`,
  `Solicitudes_estados_hist` (la migración no permitía crear las FK si no).

## ✅ Resuelto 20260802 (`20260802_agregar_fk_faltantes_y_limpiar_unique_duplicados.sql`)

**FK nuevas agregadas** (`ON DELETE NO ACTION` — a diferencia de las de 20260722, estas son
relaciones "hijo → catálogo/usuario"; borrar un cliente/usuario/catálogo no debe arrastrar
solicitudes ni historial):
- `solicitudes.sol_cliente_id → Clientes.cli_id`
- ~~`solicitudes.sol_co_id → Centro_operacion.cop_id`~~ — **eliminada el 2026-09-12** junto con
  la columna que la sostenía, ver "🔄 Actualización 2026-09-12"
- `solicitudes.sol_motivo_rechazo_id → Motivos_rechazo_solicitud.mrs_id`
- `solicitudes.sol_usuario_crea → usuarios.usr_id`
- `solicitudes.sol_usuario_modifica → usuarios.usr_id`
- `solicitudes.sol_usuario_aprueba_condiciones → usuarios.usr_id`
- `solicitudes.sol_usuario_gestion_rechazo → usuarios.usr_id`
- `Solicitud_archivo.sa_fp_id → Formulario_pregunta.fp_id`
- `Solicitud_soporte_analisis.ssa_wet_id → workflow_etapas.wet_id`
- `solicitud_workflow_historial.swh_etapa_id → workflow_etapas.wet_id`
- `solicitud_workflow_historial.swh_resultado_id → workflow_estado_etapa.wee_id`
- `Solicitudes_estados_hist.seh_estado_id → solicitud_estados.ses_id`

**Hallazgo nuevo, no estaba en el diagnóstico original:** `Formulario_pregunta` era HEAP sin
PK/UNIQUE en `fp_id` (el mismo problema que tenía `solicitudes.sol_id` antes de 20260722) —
salió al intentar crear la FK de `sa_fp_id`. Se le agregó `PK_Formulario_pregunta` (confirmado
sin nulos/duplicados: 561/561 antes de agregarla).

**UNIQUE duplicados eliminados** — se dejó el nombre descriptivo y se eliminó el autogenerado
en cada tabla; el de `workflow_estado_etapa` además se renombró de `UQ_workflow_resultados_codigo`
a `UQ_workflow_estado_etapa_codigo` (el nombre viejo no coincidía con la tabla):
- `solicitud_estados.ses_codigo` → queda `UQ_solicitud_estados_codigo`
- `workflow_etapas.wet_codigo` → queda `UQ_workflow_etapas_codigo`
- `workflow_estado_etapa.wee_codigo` → queda `UQ_workflow_estado_etapa_codigo`

**Limpieza de datos asociada:** `sol_usuario_crea` debía ser NULL cuando el creador es el
cliente (comentario ya existente en `solicitudes.service.ts`), pero las 3 solicitudes que un
cliente creó desde el portal (cli_id 13603/13605/13606, clientes de prueba) tenían el `cli_id`
guardado ahí en vez de NULL — bloqueaba la FK. Se puso a NULL antes de crear la FK (columna sí
es nullable).

## 🔄 Actualización 2026-09-12: `sol_co_id` eliminada de `solicitudes`

La FK `sol_co_id → Centro_operacion.cop_id` y el UNIQUE compuesto `UQ_numero_solicitud_centro`
agregados el 2026-08-02 **ya no existen** — no porque fallaran, sino porque la columna que
sostenían resultó vestigial. Migración:
`20260912_eliminar_centro_operacion_de_solicitudes.sql` (ver también
`centro-operacion-vestigial-en-solicitudes.md`, mismo directorio padre).

Motivo confirmado en vivo: las solicitudes creadas por el cliente siempre usaban
`sol_co_id = 1` (hardcodeado en el frontend), y ni los listados reales ni los permisos
dependían de él. Ampliación de Cupo sí llegaba a usar un centro real del cliente, pero solo
para pedir un número de consecutivo "por centro" a `sp_ObtenerSiguienteNumeroSolicitud` — se
consolidó a un consecutivo único (mismo patrón que ya usa PQRS, `cons_cop_id NULL`).

Cambios de esa migración:
- `sp_ObtenerSiguienteNumeroSolicitud` reescrito sin `@cop_id` (consecutivo único global).
- `UQ_numero_solicitud_centro` (constraint o índice) eliminado.
- `FK_solicitudes_centro_operacion` eliminada.
- Columna `solicitudes.sol_co_id` eliminada.
- Nuevo índice único simple `UQ_solicitudes_numero_solicitud` sobre `sol_numero_solicitud` solo.

Con esto, de las 12 FK agregadas el 2026-08-02 quedan **11 vigentes** (ver lista tachada arriba).

## ✅ Resuelto 20260913

**`solicitud_workflow_historial.swh_usuario_id` y `Solicitudes_estados_hist.seh_usr_id` ya
tienen FK a `usuarios`** (`FK_SolicitudWorkflowHistorial_Usuario`,
`FK_SolicitudesEstadosHist_Usuario` — migración
`20260913_agregar_fk_usuario_historial.sql`). El bloqueo que impidió agregarlas el 2026-08-02
(6 filas de prueba con un `cli_id` guardado en vez de un `usr_id`, columnas `NOT NULL`) **ya no
existía** al revisar en vivo el 2026-09-13: 0 filas huérfanas en ambas tablas (confirmado con
`LEFT JOIN usuarios ... WHERE usr_id IS NULL`) — no se necesitó ninguna limpieza de datos ni la
decisión de producto que se había planteado (usuario sentinel / columna nullable / columna
aparte). El código tampoco vuelve a introducir el problema: `resolverUsuarioIdParaAuditoria`
(`solicitudes.controller.ts`) ya devuelve `NULL` para un actor cliente, nunca su `cli_id`, y los
callers usan el fallback `usuarioId ?? 1` / `body.usuario_crea || 1` para estas dos columnas
`NOT NULL` (mismo criterio que ya usaba `sol_usuario_crea`, que sí es nullable).

**`Solicitud_documento_deprecated` se eliminó** (migración
`20260913_eliminar_solicitud_documento_deprecated.sql`, `DROP TABLE`). Confirmado antes de
borrar: 0 referencias en código en ambos repos (`BACKEND`/`FRONTEND`), HEAP sin PK/FK, 32 filas
(30 huérfanas contra `solicitudes`). Decisión explícita del usuario: borrado definitivo, no
archivado por rename — irreversible salvo restaurar backup de la BD.

## ✅ Confirmado 20260913: `Solicitud_adjunto`/`Solicitud_desarrollo` son del sistema comercial

Ya no es una sospecha por nombre — se confirmó muestreando datos reales (`SELECT TOP 5 * FROM
...`):

- **`Solicitud_adjunto`** (36 filas): aprobación de planos de muestra. Columnas `mues_id`
  (→ `Muestras`), `sola_url_plano`/`sola_url_volante` (PDFs), `sola_usuario`/
  `sola_usr_aprobacion` con usuarios reales del sistema comercial (`jorge.bermudez`,
  `ronald.cantoni`, ...), `sola_estado` (`A`/`P`/`R`). Nada de `sol_id` ni vocabulario del
  portal.
- **`Solicitud_desarrollo`** (97 filas): seguimiento de desarrollo de cliente. Columnas
  `ejng_id`, `cli_id`, `cop_id`, fechas desde **enero 2024** — antes de que existiera el
  portal de vinculación (mediados de 2026). Tampoco tiene `sol_id`.

Ninguna de las dos referencia ni es referenciada por `solicitudes`. Confirmado además que
sigue sin usarlas ningún archivo en `BACKEND/src`/`FRONTEND/src`. **No requieren ninguna
acción de esquema** — quedan documentadas acá para que nadie las confunda con el dominio del
portal por el nombre.

## ✅ Lo que sí está bien (confirmado 2026-08-02, actualizado 2026-09-13)

- Las 3 FK originales del *state machine* + las 6 de cascada (20260722) + las 12 nuevas
  (20260802, de las cuales 11 siguen vigentes tras 20260912) + las 2 de 20260913 suman
  **22 FK** en el dominio. Ninguna de las 4 solicitudes vivas (`sol_id` 2174–2192) tenía
  estado/etapa/resultado inválido.
- No hay duplicados de `sol_numero_solicitud`.
- Los índices no-únicos de apoyo sobre `sol_cliente_id`, `sol_estado_id`, `sol_etapa_actual_id`,
  `sol_resultado_etapa_id` siguen existiendo.

## Recomendación de orden de arreglo (actualizada)

1. ~~PK en `solicitudes.sol_id` + UNIQUE en `sol_numero_solicitud`~~ — hecho (20260721/20260722).
2. ~~Limpiar huérfanos y agregar FK de tablas hijas hacia `solicitudes`~~ — hecho (20260722).
3. ~~Agregar las FK de catálogo/usuario restantes + PK en `Formulario_pregunta` + eliminar
   UNIQUE duplicados~~ — hecho (20260802).
4. ~~Agregar FK de `swh_usuario_id`/`seh_usr_id` + decidir qué hacer con
   `Solicitud_documento_deprecated`~~ — hecho (20260913).
5. ~~Confirmar y documentar que `Solicitud_adjunto`/`Solicitud_desarrollo` son del sistema
   comercial~~ — hecho (20260913).

**No quedan pendientes técnicos ni de producto en este diagnóstico.**
