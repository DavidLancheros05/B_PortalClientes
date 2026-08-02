# Flujo de "Ampliación de cupo" — estado actual (2026-07-27)

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

Mecanismo (`SolicitudFormContent.tsx`), con **dos fuentes de datos
distintas** que antes del 2026-07-27 eran una sola (ver "Corrección
2026-07-27" más abajo):

1. Al abrir "Nueva solicitud" como CLIENTE:
   - El hook `useUltimaSolicitud` trae la última solicitud de
     `user.cliente_id` **sin importar su estado** (`GET
     /solicitudes/cliente/:id/ultima`). Esto solo se usa para el bloqueo de
     "ya tienes una solicitud en trámite" (ver más abajo) — no decide el
     tipo de solicitud.
   - El hook `useUltimaSolicitudAprobada` trae la última solicitud **con
     `sol_estado_id = 5` (APROBADA)** de ese mismo cliente (`GET
     /solicitudes/cliente/:id/ultima-aprobada`, backend:
     `SolicitudesListadosService.obtenerUltimaSolicitudAprobada`). Esto sí
     decide el tipo de solicitud y alimenta la precarga.
2. `tieneSolicitudesPrevias = ultimaSolicitudAprobada !== null` — solo
   cuenta si el cliente tiene al menos una solicitud que llegó a
   **APROBADA**. Una solicitud rechazada, cancelada, en borrador, pendiente
   o en revisión no cuenta.
3. Se sobreescribe la respuesta de la pregunta 1171: sin aprobación previa
   → "Cliente Nuevo"; con alguna aprobada → "Ampliación de Cupo". La
   pregunta queda en modo lectura (el cliente no la edita a mano).
4. Las respuestas de esa misma última solicitud **aprobada**
   (`ultimaSolicitudAprobada.respuestas`) se usan como precarga
   (`usePrefillConfiguracion`) del formulario nuevo — el cliente ve
   repetidos los datos de su vinculación aprobada en vez de tener que
   volver a digitarlos.

A partir de ahí es una solicitud normal de punta a punta: mismo formulario
completo, mismos documentos, mismas 5 etapas (Ejecutivo de Negocios →
Auxiliar Servicio Cliente → Oficial de Cumplimiento → Comité de Crédito 1 →
Comité de Crédito 2). El backend no tiene ninguna rama especial para este
caso — es solo una etiqueta preseleccionada en el formulario. `sol_cupo_solicitado`/
`sol_justificacion_ampliacion` **no se llenan por este camino** (son
específicos del camino 2) — este camino usa las preguntas normales del
formulario para capturar el nuevo cupo pedido.

**Bloqueo de solicitud en trámite** (independiente de lo anterior): si la
última solicitud del cliente (la de `useUltimaSolicitud`, cualquier estado)
está en BORRADOR, PENDIENTE o REVISIÓN, `SolicitudFormContent.tsx` no deja
abrir el formulario — muestra "Solicitud en Proceso" con el número de esa
solicitud y un botón "Volver". Esto sigue mirando la última solicitud sin
filtrar por estado, porque el objetivo es bloquear cualquier trámite activo,
no solo uno relacionado con aprobación.

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

## Corrección 2026-07-27: autodetección miraba cualquier estado, no solo APROBADA

**Síntoma**: en el Camino 1, `tieneSolicitudesPrevias` salía de
`useUltimaSolicitud` (la última solicitud del cliente **sin filtrar por
estado**). Un cliente cuya única solicitud previa estuviera rechazada,
cancelada, en borrador o incluso todavía pendiente/en revisión ya veía
"Ampliación de Cupo" preseleccionado — sin nunca haber tenido un cupo
aprobado. Además, la precarga del formulario (`respuestasUltima`) tomaba
las respuestas de esa misma solicitud sin aprobar, repitiendo datos de un
intento fallido o inconcluso en vez de los de la vinculación real.

**Causa**: una sola fuente de datos (`ultimaSolicitud`, sin filtro de
estado) se usaba para dos propósitos distintos que no debían compartir
condición: (a) bloquear "ya tienes una solicitud en trámite" — correcto
mirar cualquier estado activo — y (b) decidir si es una ampliación de cupo
y de dónde precargar — debía mirar solo aprobadas.

**Fix**:
- Backend: nuevo `SolicitudesListadosService.obtenerUltimaSolicitudAprobada`
  (mismo shape que `obtenerUltimaSolicitud` pero con `WHERE ... AND
  s.sol_estado_id = 5`) y endpoint `GET
  /solicitudes/cliente/:clienteId/ultima-aprobada`
  (`solicitudes.controller.ts`).
- Frontend: nuevo hook `useUltimaSolicitudAprobada` (mismo patrón que
  `useUltimaSolicitud`) consumido en `SolicitudFormContent.tsx`.
  `tieneSolicitudesPrevias` y `respuestasUltima` ahora salen de
  `ultimaSolicitudAprobada`; `ultimaSolicitud` (sin filtro) quedó reservado
  exclusivamente para el bloqueo de solicitud en trámite.
- `components/form/SolicitudForm.tsx` (que usa
  `getUltimaSolicitudRespuestas`/`/ultima-respuestas`) **no se tocó** — no
  está importado en ningún lado, es código muerto, no forma parte del
  flujo real (el real es siempre `SolicitudFormContent.tsx`).

## Corrección 2026-07-27 (2): la mayoría de preguntas no tenían fuente de precarga configurada

**Síntoma**: tras el fix anterior (mirar solo `ultima_solicitud_aprobada`), un
cliente que empezó una Ampliación de Cupo reportó que igual no se
precargaban todos los campos del último formulario aprobado.

**Causa**: `usePrefillConfiguracion` (`FRONTEND/src/hooks/usePrefillConfiguracion.ts`)
solo copia el valor de una pregunta desde `ultimaSolicitudAprobada.respuestas`
si esa pregunta tiene `Formulario_pregunta.fp_precarga_fuente = 'ultima_solicitud'`
(o `'cliente_primero'`, que cae a lo mismo si no hay dato de cliente) — esto
se configura por pregunta desde el editor de formularios
(`FRONTEND/src/app/parametrizacion/formulario-editor`, componente
`PreguntaFormPrecarga.tsx`). En la versión activa del formulario (14, 100
preguntas), solo 15 tenían alguna fuente configurada; las otras 85 nunca
iban a precargarse sin importar de dónde saliera el dato — no es un bug de
código, es una parametrización incompleta.

**Fix**: migración `migrations/20260727_activar_precarga_ultima_solicitud_preguntas_faltantes.sql`,
activa `fp_precarga_fuente = 'ultima_solicitud'` para las preguntas de la
versión activa que estaban en `NULL`, limitado a tipos donde copiar el
valor es seguro (`TEXTO`, `NUMERO`, `FECHA`, `SELECT`, `SELECT_TABLA`).
Deja fuera a propósito `DOCUMENTOS_TABLA`/`ESPACIO_FIRMA` (documentos y
firmas deben rehacerse en cada solicitud), `TABLA` (estructura de filas
repetidas que el hook no soporta) y `MULTISELECT` (el hook solo guarda un
valor por `fp_id`, perdería selecciones múltiples). Resultado en la
versión 14: de 8 a 55 preguntas con `ultima_solicitud`; quedan 38 sin
precarga (los tipos excluidos arriba, más `NOTA` que es texto informativo
sin respuesta).

**Ampliación 2026-07-27 (3)**: a pedido del usuario, se completó también
`TABLA` y `MULTISELECT` en vez de dejarlos pendientes:

- `TABLA` en realidad no tenía limitación técnica — guarda sus filas como
  un único JSON en `fr_valor_texto` (una sola fila de
  `Formulario_respuesta`), se copia igual de simple que un `TEXTO`. Bastó
  con incluirlo en la migración
  (`20260727_activar_precarga_tabla_multiselect.sql`).
- `MULTISELECT` sí requería código: guarda una fila de
  `Formulario_respuesta` por cada opción marcada (mismo `fr_fp_id`
  repetido), y la indexación simple que usaba
  `useUltimaSolicitudAprobada` se quedaba solo con la última fila leída,
  perdiendo las demás opciones. Se extrajo la lógica de agrupación
  (agrupar por `fp_id`, quedarse con las filas del guardado más reciente
  usando una ventana de 2s, armar arreglo si es `MULTISELECT`) que ya
  existía en `useSolicitudEdicion.ts` hacia un helper compartido
  (`FRONTEND/src/lib/agruparUltimaRespuestaPorPregunta.ts`), usado ahora
  por ambos hooks. `useUltimaSolicitudAprobada` recibe `preguntas` como
  parámetro nuevo (necesario para saber qué `fp_id` son `MULTISELECT`) y
  espera a que estén cargadas antes de pedir la última solicitud aprobada.

**Quedan sin precarga, por diseño** (no por limitación técnica): las 9
`DOCUMENTOS_TABLA` y 3 `ESPACIO_FIRMA` de la versión activa — documentos y
firmas deben verificarse/firmarse de nuevo en cada solicitud, no
reutilizarse de una aprobación anterior (decisión confirmada con el
usuario). Las 14 `NOTA` tampoco aplican — son texto informativo, no una
respuesta del cliente.

## Corrección 2026-07-27 (4): precarga rota al cambiar la versión activa del formulario

**Pregunta que originó esto**: "¿y cuando cambia la versión que pasa?"

**Síntoma real (confirmado en BD, no en pantalla)**: cada vez que se crea
una versión nueva del formulario clonando la anterior
(`FormulariosService.copiarPreguntasAVersion`), cada pregunta recibe un
`fp_id` NUEVO (columna IDENTITY), aunque sea "la misma" pregunta.
Confirmado en vivo: "Origen de fondos:" es `fp_id=2715` en la versión 13 y
`fp_id=2812` en la versión 14. La precarga (`usePrefillConfiguracion`)
buscaba la respuesta de la última solicitud aprobada por `fp_id` exacto —
en cuanto la versión activa del formulario cambia respecto a la versión en
que se aprobó la última solicitud del cliente, la búsqueda deja de
encontrar **cualquier** respuesta (no solo algunas), porque todos los
`fp_id` de esa versión vieja quedan huérfanos frente a los de la versión
nueva. No se había notado porque en las pruebas de esta sesión la
solicitud aprobada de prueba y la versión activa coincidían (ambas v14) —
pero apenas alguien active una versión 15, se rompe para todo cliente cuya
aprobación previa quedó en v14.

**Causa raíz**: no existía ninguna identidad de pregunta que sobreviviera
al clonado de versión. `fp_codigo` ya cumplía ese papel en teoría (se
copia igual al clonar, sin cambiar — así reconoce `TIPO_SOLICITUD` sin
importar la versión), pero casi nadie lo tenía asignado: 9 de 100
preguntas en la versión activa.

**Fix** (solución de fondo, no un parche por versión puntual):

1. **Backfill** (`migrations/20260727_backfill_fp_codigo_identidad_entre_versiones.sql`):
   asigna `fp_codigo` a las 518 preguntas activas (`fp_estado=1`) de todo
   el histórico de versiones que no lo tenían, agrupándolas por
   `(formulario_id, seccion_id, fp_descripcion, fp_tipo)` — mismo texto +
   misma sección + mismo tipo = misma pregunta a través de versiones
   (`Formulario_secciones` no está versionada, `seccion_id` ya es estable
   entre versiones). Se filtra `fp_estado=1` porque hay filas huérfanas
   duplicadas con texto igual pero inactivas (ej. dos filas "Tipo de
   solicitud" en la v14, solo una activa) que no deben mezclarse. Si el
   grupo ya tenía un código en alguna fila, se propaga a las demás; si no,
   se genera uno nuevo determinístico (`AUTO_Q<fp_id más bajo del grupo>`).
   Verificado: "Origen de fondos:" quedó con el mismo código
   (`AUTO_Q1202`) en v13 y v14.
2. **Backend**: nuevo método
   `SolicitudesRespuestasService.obtenerRespuestasConCodigoPregunta`
   (`solicitudes-respuestas.service.ts`) — igual que `obtenerRespuestas`
   pero con `LEFT JOIN Formulario_pregunta` para sumar `fp_codigo` a cada
   fila. Usado solo por `GET /solicitudes/cliente/:id/ultima-aprobada`
   (los demás endpoints de respuestas no se tocaron, para no arriesgar
   nada fuera del alcance de este fix).
3. **Frontend**: `useUltimaSolicitudAprobada` ahora arma, además de
   `respuestas` (indexadas por `fp_id`, como antes), `respuestasPorCodigo`
   (indexadas por `fp_codigo`). `usePrefillConfiguracion` recibe ese mapa
   nuevo (`respuestasUltimaPorCodigo`) y busca primero por
   `pregunta.fp_codigo`; si la pregunta no tiene código o no aparece ahí,
   cae al `fp_id` directo (comportamiento previo, sigue sirviendo cuando
   la versión no cambió).

**Preguntas nuevas hacia adelante**: el editor de formularios no tiene
ningún campo para asignar `fp_codigo` a mano (se revisó
`PreguntaFormPrecarga.tsx` y el resto del formulario del editor — no
existe), así que depender de que un admin lo complete no era viable.
En cambio, `FormularioPreguntasService.create()`
(`BACKEND/src/parametrizacion/formulario-preguntas/formulario-preguntas.service.ts`)
genera el código automáticamente (`AUTO_Q<fp_id>`) si queda vacío al crear
cualquier pregunta nueva — así ninguna pregunta futura puede quedar sin
identidad estable entre versiones. Las preguntas clonadas al crear una
versión nueva (`copiarPreguntasAVersion`) ya heredaban el código de origen
sin cambios, eso no requirió tocarlo.

## Corrección 2026-07-27 (5): las opciones de SELECT/MULTISELECT tenían el mismo problema, sin resolver

**Encontrado al pedir un análisis de casos extremos del fix (4)**: arreglar
`fp_codigo` reconoce la *pregunta* entre versiones, pero para preguntas
`SELECT`/`MULTISELECT` el *valor guardado* (`fr_valor_opcion_id`) es un
`fpo_id` de `Formulario_pregunta_opcion` — que tiene exactamente el mismo
problema (IDENTITY, cambia al clonar). Confirmado en vivo: la opción
"Ampliacion de cupo" de `TIPO_SOLICITUD` es `fpo_id=11519` en v13 y
`fpo_id=11595` en v14. Sin identidad estable ahí, esas ~25 preguntas de la
versión activa (22 SELECT + 3 MULTISELECT) seguían sin precargar
correctamente en cuanto la versión cambiara — no seleccionaban mal (el
`<select>` solo compara contra las opciones de la propia pregunta, así que
un id ajeno simplemente no encuentra match), pero sí quedaban vacías otra
vez.

**Fix, mismo patrón que `fp_codigo`**:

1. Columna nueva `Formulario_pregunta_opcion.fpo_codigo` (dos migraciones,
   separadas porque SQL Server exige que el `ALTER TABLE` y el uso de la
   columna nueva estén en batches distintos):
   `20260727_agregar_fpo_codigo_identidad_opciones_entre_versiones.sql` y
   `20260727_backfill_fpo_codigo_identidad_opciones_entre_versiones.sql`.
   Backfill a 364 de 395 opciones activas, agrupando por
   `(fp_codigo de la pregunta dueña, fpo_valor)` — las 31 que no
   recibieron código son opciones de preguntas duplicadas ya inactivas
   (`fp_estado=0`, el mismo tipo de fila huérfana que ya se había excluido
   para `fp_codigo`).
2. `copiarPreguntasAVersion` (clonado de versión): el INSERT de opciones
   era hardcodeado a 3 columnas (`fpo_fp_id, fpo_valor, fpo_estado`) — se
   agregó `fpo_codigo` para que se propague en clonados futuros.
3. `OpcionesService.create()`: genera `fpo_codigo` automático
   (`AUTO_O<fpo_id>`) si queda vacío, igual que
   `FormularioPreguntasService.create()` para `fp_codigo` — el editor
   tampoco tiene campo para asignarlo a mano.
4. Backend: `obtenerRespuestasConCodigoPregunta` ahora suma también
   `fpo_codigo` (JOIN a `Formulario_pregunta_opcion` por
   `fr_valor_opcion_id`).
5. Frontend: `agruparUltimaRespuestaPorPregunta` arma además
   `valor_opcion_codigo` (código de la opción, no el id) junto al
   `valor_opcion_id` de siempre. `usePrefillConfiguracion` lo usa para
   *traducir*: busca en `pregunta.opciones` (las de la versión activa,
   que ahora traen `op_codigo`) cuál tiene ese código, y usa su `op_id`
   vigente — solo si no encuentra ninguna coincidencia deja el campo sin
   precargar.

**Verificado en vivo** con la solicitud aprobada real más vieja que existe
(`sol_id=2174`, versión 9, la más alejada de la versión activa 14 entre
los datos reales): 24 de 26 respuestas tipo-opción resolvieron
`fp_codigo`+`fpo_codigo` correctamente extremo a extremo. Las 2 que no
son preguntas/opciones que ya estaban inactivas de antes — degradan a "sin
precargar" (comportamiento aceptable, no nuevo).

**Limitación conocida, no corregida (bajo impacto verificado)**:
`agruparUltimaRespuestaPorPregunta` hace `fr_valor_numero || undefined` —
si una respuesta numérica real fuera `0`, se trataría como "sin
respuesta" y no precargaría. Es un bug preexistente (ya estaba en
`useSolicitudEdicion.ts` antes de esta sesión), verificado que hoy no
afecta ningún dato real (`0` filas con `fr_valor_numero = 0` sobre
preguntas con precarga activa), pero queda anotado por si se llena algún
campo con `0` en el futuro.

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
