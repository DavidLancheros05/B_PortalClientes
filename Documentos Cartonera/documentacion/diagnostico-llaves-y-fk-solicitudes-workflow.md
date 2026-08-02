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

**Qué quedó pendiente y por qué:** hay 2 columnas parecidas al punto 3
(`swh_usuario_id` y `seh_usr_id`, en las tablas de historial) que tienen el mismo problema,
pero **no se pueden simplemente vaciar** porque la base de datos las obliga a tener siempre un
valor (no permite dejarlas vacías). Antes de poder arreglarlas hay que decidir algo: ¿se crea
un usuario "genérico" para representar acciones que hace el cliente sobre su propia solicitud?
¿se permite que esa columna quede vacía? ¿se agrega una columna aparte para eso? Esa decisión
no se tomó sola porque cambia cómo funciona el sistema, no es solo un arreglo de base de datos.

También quedaron 2 puntos que son decisiones de negocio, no arreglos técnicos: qué hacer con
dos tablas (`Solicitud_adjunto`, `Solicitud_desarrollo`) que parecen ser de otro sistema pero
viven en la misma base de datos, y qué hacer con una tabla vieja ya reemplazada
(`Solicitud_documento_deprecated`) — ¿se archiva, se borra?

El resto del documento (abajo) es el detalle técnico completo, con nombres exactos de tablas,
columnas y constraints, para quien necesite ese nivel de precisión.

## Detalle técnico

Revisión hecha en vivo contra la base de datos real (`sys.tables`, `sys.key_constraints`,
`sys.indexes`, `sys.foreign_keys`), no contra `DATABASE.md` (desactualizado desde mayo 2026).

Diagnóstico original: 2026-07-18. Revalidado en vivo el 2026-08-02 (ver sección "✅ Resuelto
20260721/20260722"). **Corregido en vivo el 2026-08-02** con la migración
`20260802_agregar_fk_faltantes_y_limpiar_unique_duplicados.sql` — ver sección "✅ Resuelto
20260802" más abajo. Solo quedan 2 puntos pendientes por decisión de producto (no de schema).

Tablas cubiertas: `solicitudes`, `Solicitud_archivo`, `Solicitud_soporte_analisis`,
`solicitud_workflow_historial`, `Solicitudes_estados_hist`, `solicitud_estados`,
`workflow_etapas`, `workflow_estado_etapa`, `Motivos_rechazo_solicitud`, `Formulario_pregunta`,
`param_dias_respuesta_solicitudes`, más los hallazgos colaterales `Solicitud_adjunto`,
`Solicitud_desarrollo` y `Solicitud_documento_deprecated`.

## ✅ Resuelto 20260721 / 20260722

- **`solicitudes` ya tiene llave primaria**: `PK_solicitudes` (clúster) en `sol_id`. Ya no es
  HEAP.
- **`sol_numero_solicitud` ya tiene UNIQUE** — compuesto con `sol_co_id`
  (`UQ_numero_solicitud_centro`). Además hay un índice único filtrado `IDX_UQ_cliente_borrador`
  que impide más de una solicitud en estado BORRADOR por cliente.
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
- `solicitudes.sol_co_id → Centro_operacion.cop_id`
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

## 🔴 Pendiente — requiere decisión de producto, no es un fix de schema

**1. `solicitud_workflow_historial.swh_usuario_id` y `Solicitudes_estados_hist.seh_usr_id` NO
tienen FK a `usuarios` todavía.** Mismo problema que `sol_usuario_crea` (cliente autoservicio
guarda su `cli_id` ahí en vez de un `usr_id`), pero a diferencia de esa, **estas dos columnas
son `NOT NULL`** — confirmado al intentar el mismo `UPDATE ... SET = NULL` usado para
`sol_usuario_crea` (SQL Server lo rechazó: "column does not allow nulls"). Hay 6 filas de
prueba afectadas en cada tabla (mismos 3 cli_id). No se puede resolver con una limpieza de
datos sola; hace falta decidir una de estas antes de poder agregar la FK:
- Crear un usuario "sentinel" (ej. `Sistema / Cliente autoservicio`) en `usuarios` y apuntar
  ahí las filas de clientes que actúan sobre su propia solicitud (requiere también tocar el
  código que graba estas columnas, no solo un `UPDATE` puntual).
- Relajar `swh_usuario_id`/`seh_usr_id` a nullable (como ya es `sol_usuario_crea`) y guardar
  NULL para acciones de cliente.
- Agregar una columna separada para "actor cliente" en vez de sobrecargar la de usuario.

## 🟡 Medio (sigue vigente, sin cambios)

**2. Tablas homónimas de otro sistema, con datos reales:** `Solicitud_adjunto` (36 filas, FK a
`Muestras`) y `Solicitud_desarrollo` (97 filas, FK a `Clientes`/`Centro_operacion`) — sigue sin
usarlas ningún archivo en `BACKEND/src`. Por el nombre parecen pertenecer al dominio de
solicitudes del portal, pero son de otro módulo que comparte la misma base de datos. Riesgo de
que alguien las confunda con las tablas del flujo de vinculación. Sin acción tomada — es una
decisión de "qué hacer", no un fix mecánico.

**3. `Solicitud_documento_deprecated`**: sigue HEAP sin PK, sin FK, sin ninguna referencia en
el código (fue reemplazada por `Solicitud_archivo`, ver `CLAUDE.md`). 30 de 32 filas huérfanas
contra `solicitudes` — excluida a propósito de la limpieza de 20260722 y de 20260802. Candidata
a archivar/eliminar formalmente; no se tocó porque es una decisión de negocio (¿archivar antes
de borrar?), no un fix de integridad.

## ✅ Lo que sí está bien (confirmado 2026-08-02)

- Las 3 FK originales del *state machine* + las 6 de cascada (20260722) + las 12 nuevas
  (20260802) suman 21 FK en el dominio. Ninguna de las 4 solicitudes vivas (`sol_id` 2174–2192)
  tiene estado/etapa/resultado inválido.
- No hay duplicados de `(sol_numero_solicitud, sol_co_id)`.
- Los índices no-únicos de apoyo sobre `sol_cliente_id`, `sol_estado_id`, `sol_etapa_actual_id`,
  `sol_resultado_etapa_id` siguen existiendo.

## Recomendación de orden de arreglo (actualizada)

1. ~~PK en `solicitudes.sol_id` + UNIQUE en `sol_numero_solicitud`~~ — hecho (20260721/20260722).
2. ~~Limpiar huérfanos y agregar FK de tablas hijas hacia `solicitudes`~~ — hecho (20260722).
3. ~~Agregar las FK de catálogo/usuario restantes + PK en `Formulario_pregunta` + eliminar
   UNIQUE duplicados~~ — hecho (20260802).
4. Decidir el manejo de "usuario = cliente autoservicio" en `swh_usuario_id`/`seh_usr_id` (ver
   punto crítico 1) para poder cerrar esas 2 FK.
5. Decidir qué hacer con `Solicitud_adjunto`/`Solicitud_desarrollo` (documentar que son de otro
   dominio) y con `Solicitud_documento_deprecated` (archivar/borrar).
