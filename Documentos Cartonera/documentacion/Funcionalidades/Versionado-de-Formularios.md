# Versionado de formularios — Auditoría y correcciones

> Funcionalidad: administración de versiones de un formulario (`Parametrización > Formularios > [id] > Versiones`) — crear una versión nueva clonando otra, activar cuál versión usan las solicitudes nuevas, eliminar una versión que no sirvió. Tablas: `formularios`, `Formulario_versiones`, `Formulario_pregunta`, `Formulario_pregunta_opcion`.
>
> Trabajo hecho sobre el código real (`B_PortalClientes/src/parametrizacion/formularios`, `formulario-preguntas`, `opciones`), con correcciones aplicadas y probadas en vivo contra la base de datos compartida (`SQL8020.site4now.net`) vía `curl` + JWT y `scripts/db-query.mjs`. Generado 2026-07-18.

## Bugs encontrados (todos pre-existentes, ninguno introducido en esta sesión salvo donde se aclara)

1. **`crearNuevaVersion` solo copiaba 12 de las ~25 columnas de `Formulario_pregunta`**, con una lista fija a mano. Cualquier columna agregada después del diseño original se perdía en silencio al clonar a una versión nueva: `fp_tabla_columnas` (una pregunta tipo TABLA quedaba sin columnas), `fp_catalogo_*` (un CATALOGO perdía el vínculo a su tabla externa), `fp_tipo_documento_id` (se perdía el vínculo a "documento diferido"/plantilla), `fp_codigo`/`fp_oculto_en_formulario` (una pregunta oculta volvía a aparecer visible y editable en la versión nueva).
2. **El `UPDATE formularios SET Formulario_versiones_totales = ...` al final de `crearNuevaVersion` apuntaba a una columna que no existe** — ese total siempre se calcula al vuelo con un subquery, nunca fue una columna real. El endpoint devolvía `400` en cada llamada aunque el trabajo de clonar preguntas sí se hiciera bien por debajo.
3. **`activarVersion` y `eliminarVersion` le pegaban a `formularios.formulario_version`, una columna que nunca existió.** En toda la app "versión activa" siempre se calculó al vuelo como `MAX(fv_numero)` — no había ningún mecanismo real para fijar una versión anterior como la vigente, a pesar de que la UI ya tenía un botón "Activar" funcional en apariencia ("¿Activar versión N? Las nuevas solicitudes usarán esta versión"). Confirmado en vivo: `activarVersion` nunca actualizaba nada, y `eliminarVersion` fallaba antes de validar nada.
4. **La copia de opciones (`Formulario_pregunta_opcion`) al clonar una versión emparejaba preguntas por texto de descripción** (`fp2.fp_descripcion = fp1.fp_descripcion`), no por id. Ya existe un caso real de dos preguntas con el mismo texto ("Tipo de solicitud", sección "Aviso legal", `fp_id` 1171 y 1142) — con datos así, la copia de opciones podía quedar mal asignada.
5. **Los guards de "no editar/eliminar una pregunta u opción con solicitudes asociadas" (agregados en esta sesión) consultaban `solicitudes.formulario_version`** en vez de `sol_formulario_version` (prefijo real de la tabla). Bug propio, detectado y corregido en la misma sesión antes de dejar el código: bloqueaban todo edit/delete con un error SQL crudo en vez de validar de verdad.
6. **Rendimiento**: la primera implementación corregida de `crearNuevaVersion` hacía un round-trip a la base remota por cada pregunta (insert) y por cada pregunta con opciones — con un formulario real de 89 preguntas, más de 2 minutos por llamada (riesgo real de timeout de gateway en producción).

## Correcciones aplicadas

1. **`crearNuevaVersion` ahora descubre las columnas a copiar dinámicamente** vía `INFORMATION_SCHEMA.COLUMNS` en vez de una lista a mano — cualquier columna nueva que se agregue a `Formulario_pregunta` en el futuro se copia sola, sin tener que acordarse de tocar este método.
2. **Las auto-referencias entre preguntas se reescriben tras clonar** (`fp_pregunta_padre_id`, `fp_tabla_limite_pregunta_id`): cada pregunta se inserta una por una capturando su `fp_id` nuevo (`OUTPUT INSERTED.fp_id`), se arma un mapa `fp_id` viejo → nuevo, y en una segunda pasada se corrigen las referencias para que apunten al clon del mismo pariente en la versión nueva, no al de la versión de origen.
3. **Las opciones se copian por el mapa exacto de `fp_id`**, no por coincidencia de texto — elimina la ambigüedad del bug 4.
4. **Se agregó la columna real `formularios.frm_version_activa`** (migración `20260718_agregar_frm_version_activa.sql`, nullable — `NULL` = "sin fijar, usar la más reciente"). `activarVersion` ahora escribe esa columna de verdad (y valida que la versión exista antes de fijarla). Se actualizaron los **9 lugares** del backend que calculaban "versión activa" para que la respeten con el mismo fallback a "la más reciente" cuando nadie fijó nada: `obtenerActivo`, `listar`, `obtenerPorId`, `obtenerVersiones`, `eliminarVersion` (`formularios.service.ts`), y los 3 puntos que deciden contra qué versión se crea una solicitud nueva (`solicitudes.service.ts`, `ampliacion-cupo.service.ts`, `formulario-preguntas.service.ts::findPreguntasFormularioActivo`). El cálculo del *siguiente número de versión* en `crearNuevaVersion` se dejó sin tocar a propósito — debe seguir siendo el máximo histórico, no el activo.
5. **Se sacó el `UPDATE` a la columna inexistente** al final de `crearNuevaVersion`.
6. **Guards de edición corregidos** (`formularios.service.ts::eliminar`, `formulario-preguntas.service.ts::update/remove`, `opciones.service.ts::update/remove`): ahora sí bloquean con un mensaje claro ("Creá una nueva versión del formulario para hacer cambios") en vez de tirar un error SQL.
7. **Rendimiento**: inserts de preguntas con concurrencia acotada (8 en paralelo) en vez de secuencial, y copia de opciones en un único `INSERT` set-based con la correlación viejo→nuevo inline (`VALUES` en lote de 200) en vez de una consulta por pregunta. **De 2+ minutos a 7 segundos** con el mismo formulario de 89 preguntas, verificado en vivo.

## Comportamiento nuevo (protección contra editar datos ya usados)

Antes de esta sesión, no había ninguna protección: se podía editar/eliminar una pregunta u opción, o borrar un formulario/versión completo, aunque ya tuviera solicitudes reales respondidas contra esa versión — y como el PDF (`obtenerFormularioRenderizable`) relee las preguntas **en vivo** (no guarda una foto de cómo eran al momento de responder), esto cambiaba en silencio lo que mostraba el PDF de una solicitud enviada hace meses, o dejaba respuestas ya dadas invisibles (soft-delete).

Ahora:
- No se puede eliminar un formulario si está activo o si alguna de sus versiones tiene solicitudes asociadas.
- No se puede editar/eliminar una pregunta u opción si la versión a la que pertenece ya tiene solicitudes asociadas.
- La salida segura sigue siendo "Crear nueva versión" (`copiarDeVersion`), que ahora clona correctamente todas las columnas.

## Verificado en vivo (contra la base compartida, con limpieza posterior)

- `crearNuevaVersion` con `copiarDeVersion` sobre el formulario real (89 preguntas): columnas de tabla, flag oculto+código, y auto-referencias preservadas correctamente en la versión clonada; opciones copiadas al `fp_id` correcto. 7 segundos.
- `activarVersion` sobre una versión anterior: se refleja de inmediato en `GET /parametrizacion/formularios/activo` (el que usa "nueva solicitud").
- `eliminarVersion`: bloquea la versión activa, bloquea una versión con solicitudes reales asociadas (mensaje claro, no error SQL), permite eliminar una versión de prueba sin uso.
- Guard de edición de pregunta: bloquea con el mensaje correcto sobre una pregunta de una versión con solicitudes reales.
- Estado de la base restaurado al valor original (`frm_version_activa = 9`, la versión que ya estaba en uso) al terminar las pruebas.

## Aviso proactivo en el editor cuando la versión ya tiene solicitudes (2026-07-18, sesión posterior)

Los guards del punto anterior (`assertVersionSinSolicitudes` en `formulario-preguntas.service.ts` y `opciones.service.ts`) funcionan, pero solo se descubrían **al intentar guardar**: el usuario abría "Editar" sobre una pregunta de una versión con solicitudes reales, completaba el formulario, apretaba guardar, y recién ahí el backend devolvía `400` con el mensaje de error. La causa: `readonly` en `formulario-editor/page.tsx` (`F_PortalClientes`) era pura y exclusivamente un query param (`?readonly=true`) puesto a mano por quien arma el link (ej. el botón "Ver" de `versiones/page.tsx`); nada en el editor consultaba si la versión realmente tenía solicitudes antes de dejar entrar a edición, así que el botón "Editar" de cualquier versión llevaba siempre al modo editable sin importar su estado real.

Cambios (solo lectura de datos ya existentes, ningún guard nuevo):

- **Backend** — `formularios.service.ts::getFormularioCompleto`: se agregó una tercera consulta en paralelo (`SELECT COUNT(*) FROM solicitudes WHERE sol_formulario_version = @0`, mismo criterio que `assertVersionSinSolicitudes`) y el resultado se expone como `formulario.tiene_solicitudes` en la respuesta de `GET /parametrizacion/formularios/:id/completo` — el mismo endpoint que ya usa el editor para cargar todo.
- **Frontend** (`formulario-editor/page.tsx`, `hooks/types.ts`):
  - Nuevo derivado `noEditable = readonly || formulario.tiene_solicitudes`, usado (en vez de `readonly` puro) para deshabilitar **Editar**, **Eliminar** y **reordenar** (↑/↓ y drag&drop) de cada pregunta.
  - **"Nueva Pregunta" se dejó fuera de `noEditable` a propósito**: el backend (`FormularioPreguntasService.create` / `OpcionesService.create`) no tiene ninguna restricción de solicitudes al crear, solo al editar/eliminar — bloquearla también habría sido una restricción inventada en el frontend sin respaldo en el backend.
  - Edición de **secciones** (`useSeccionEditor`) se dejó atada solo a `readonly`, no a `noEditable`: `Formulario_secciones` no tiene columna de versión, es una tabla compartida entre todas las versiones de todos los formularios, así que el guard de "versión con solicitudes" no aplica ahí.
  - Banner nuevo, visible apenas carga la página (antes de tocar nada): *"🔒 Esta versión (vN) ya tiene solicitudes asociadas, por lo que sus preguntas y opciones no se pueden editar ni eliminar. Creá una nueva versión del formulario para hacer cambios."* + badge "🔒 Con solicitudes asociadas" junto al nombre del formulario.

Verificado solo con `tsc --noEmit` en ambos proyectos (sin errores) — **no se probó en vivo en el navegador** contra una versión real con solicitudes asociadas.

## Deuda técnica de UI: modales viejos (`alert`/`confirm` nativos del navegador)

La app ya tiene un componente de modal propio, `ConfirmModal` (`F_PortalClientes/src/components/modals/ModalesGenericos.tsx`), y `formulario-editor/page.tsx` lo usa (ej. confirmar eliminar una pregunta/sección/opción). Pero el resto de esta misma feature (CRUD de formularios y gestión de versiones) quedó con los diálogos nativos `alert()`/`confirm()` del navegador — feos, no estilizados, bloquean el hilo de JS, y en `confirm()` el texto no admite el markup que sí usa el resto de la UI (emojis sueltos como separador de línea en vez de formato real). Detectado por el usuario al revisar esta carpeta de documentación, no corregido todavía — solo registrado acá.

Ocurrencias (todas dentro de `F_PortalClientes/src/app/parametrizacion/formularios`):

- `page.tsx:58` — `confirm()` antes de eliminar un formulario completo ("Eliminar el formulario... eliminará sus versiones y preguntas asociadas").
- `page.tsx:68` — `alert()` con el mensaje de error si falla esa eliminación.
- `[formularioId]/versiones/page.tsx:48` — `alert()` genérico (`showNotification`) usado tanto para éxito como error al activar una versión.
- `[formularioId]/versiones/page.tsx:270` — `confirm()` antes de activar una versión ("¿Activar versión N?... Las nuevas solicitudes usarán esta versión").
- `[formularioId]/nueva-version/page.tsx:56` y `:61` — `alert()` de éxito/error al crear una versión nueva.
- `nuevo/page.tsx:16,29,39` — `alert()` de validación y de error al crear un formulario nuevo.

No incluido en este trabajo: reemplazarlos por `ConfirmModal` (y un equivalente de notificación no bloqueante, que hoy no existe como componente reusable — habría que revisar si ya existe en otra parte de la app antes de crear uno nuevo).

## Pendiente / no incluido en este trabajo

- No se auditó a fondo el resto de columnas de `Formulario_pregunta_opcion` más allá de `fpo_valor`/`fpo_estado` (son las únicas dos que existen hoy, confirmado).
- No se agregó backfill de `frm_version_activa` para otros formularios que pudieran existir en el futuro (hoy solo hay uno, `frm_id=1`) — no aplica hasta que exista un segundo formulario real.
