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
Se corrigió y verificó en vivo esta sesión).

**Actualización 2026-08-01**: sí está enlazada en el menú. Verificado en BD:
`pc_modulos.mod_id = 107` ("Solicitud Ampliación Cupo", ruta
`/solicitudes/solicitud-ampliacion-cupo`, padre "Solicitudes" `mod_id = 83`,
`mod_estado = 1`), con permisos en `pc_rol_modulo` para `ADMIN` y
`EJECUTIVO` (`rm_ver/rm_crear/rm_editar = 1`, `rm_activo = 1`). No hay
ninguna migración en `migrations/` que inserte estas filas — se hicieron
directo en BD en algún momento después del 2026-07-27, sin quedar rastro en
git. La nota "pendiente, sin enlace en menú" de más abajo (sección "Enlace
al menú") ya no aplica.

Flujo (`AmpliacionCupoService.create()` en
`BACKEND/src/ampliacion-cupo/ampliacion-cupo.service.ts`):

1. El Ejecutivo selecciona un cliente. El selector (`GET
   /clientes/aprobados`) solo muestra clientes con al menos una solicitud
   con `sol_estado_id = 5` (APROBADA en la tabla real `solicitud_estados`
   — no confundir con `FRONTEND/src/constants/estado-solicitud.ts`, que
   hasta el 2026-07-13 tenía este id mal).
2. Se bloquea si el cliente ya tiene una solicitud en trámite
   (`sol_estado_id IN (1,2,3)` — ver corrección (9) más abajo).
3. `verificarDocumentosVencidos(clienteId)` revisa si el cliente tiene
   documentos vencidos — desde el 2026-08-02 vía `Cliente_archivo`
   (archivo consolidado del cliente, ver "Corrección 2026-08-02:
   `verificarDocumentosVencidos` migrado a `Cliente_archivo`" más abajo),
   antes miraba `Solicitud_archivo` de la última solicitud puntual.
   - **Sin vencidos** → la nueva solicitud se crea directo en etapa
     **Oficial de Cumplimiento** (`sol_estado_id = 3` REVISION), saltándose
     Ejecutivo de Negocios y Auxiliar Servicio Cliente — porque ya se
     verificó que los documentos administrativos siguen vigentes.
   - **Con vencidos** → se crea en etapa **Cliente** (`sol_estado_id = 2`
     PENDIENTE), para que el cliente vuelva a subir lo vencido antes de
     seguir.
4. Se inserta la fila en `solicitudes`, con `sol_cupo_solicitado`,
   `sol_justificacion_ampliacion` y `sol_cupo_actual_referencia` (ver
   corrección (8)) ya poblados desde el formulario de esta página, y se
   registra en `solicitud_workflow_historial`.
5. Se llenan las respuestas equivalentes en `Formulario_respuesta`: primero
   `TIPO_SOLICITUD`/`SOLICITA_CREDITO`/`CUPO_SOLICITADO` con valor fresco
   (corrección (10)), luego el resto de respuestas clonadas de la última
   solicitud aprobada del cliente (corrección (14)).
6. De ahí en adelante sigue el mismo camino que cualquier solicitud en esa
   etapa — no hay tratamiento especial más allá del punto de entrada.

**Enlace al menú**: ya resuelto (ver "Actualización 2026-08-01" arriba) —
la página aparece en el menú de Solicitudes para ADMIN y EJECUTIVO.

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

## Corrección 2026-08-02: `verificarDocumentosVencidos` migrado a `Cliente_archivo`

**Dos problemas encontrados en auditoría de código** (no en un reporte de
usuario), detalle completo en
`documentacion/bug-vencimiento-documentos-huecos-2026-08-02.md`:

1. La query no restringía por `sol_id` de la última solicitud del cliente
   — miraba *cualquier* solicitud histórica (incluida una rechazada) en
   busca de un documento vencido. Se corrigió acotando primero a la última
   solicitud.
2. Ese fix quedó superado el mismo día: `Cliente_archivo` (ver
   `documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md`)
   pasó de "plan sin implementar" a implementado, con backfill real (22
   filas para 3 clientes) y promoción automática al aprobar en CC2. Por
   pedido del usuario, `verificarDocumentosVencidos` se migró a consultar
   `Cliente_archivo` directamente (vía `ClienteArchivoService.tieneDocumentosVencidos`)
   en vez de `Solicitud_archivo` — ya no depende de en qué solicitud puntual
   se subió cada documento por última vez. Un cliente sin ninguna fila en
   `Cliente_archivo` se trata como "vencido" (conservador), no como "todo
   vigente".

## Corrección 2026-08-01 (6): dropdown de selección de cliente se recortaba

**Síntoma**: en `solicitud-ampliacion-cupo` (Camino 2), al escribir en el
buscador de cliente, la lista de sugerencias aparecía cortada.

**Causa**: el card blanco del formulario tiene `overflow-hidden` (para que
las esquinas redondeadas se vean bien), y la lista era un `<div
absolute>` normal dentro de ese mismo card — en cuanto la lista era más
alta que el espacio libre dentro del card, quedaba recortada por el borde.

**Fix**: la lista ahora se renderiza vía `createPortal` a `document.body`,
con posición `fixed` calculada desde `getBoundingClientRect()` del botón
(mismo patrón que ya usa `FRONTEND/src/components/FormularioUI/SearchableSelect.tsx`
en el resto del proyecto). Ya no depende del contenedor padre.

## Corrección 2026-08-01 (7): "Fecha Solicitud" y "Consumo Mensual" salían vacíos

**Síntoma**: en la misma página, la sección "Información de Última
Solicitud" mostraba "Fecha Solicitud: -" siempre, y "Consumo Mensual
Proyectado" nunca aparecía.

**Causa**: el frontend (`UltimaSolicitud` interface en
`solicitud-ampliacion-cupo/page.tsx`) esperaba campos `fecha_creacion` y
`consumo_mensual_proyectado`, pero el endpoint real (`GET
/solicitudes/cliente/:id`, `SolicitudesListadosService.obtenerSolicitudesPorCliente`)
siempre devolvió esos datos como `sol_fecha_creacion` y
`sol_consumo_mensual_proyectado`. Nunca hubo coincidencia de nombre.

**Fix**: interfaz corregida a los nombres reales del API; de paso se quitó
un campo `observaciones` que no existía en ningún lado y se tipó
`sol_cupo_aprobado` (antes leído con `as any`).

## Estilo visual homogéneo (2026-08-01)

A pedido del usuario, `solicitud-ampliacion-cupo/page.tsx` se restiló para
igualar el lenguaje visual de `gestion-ejecutivo-negocios/[id]/registrar`
(header con barra degradada azul + ícono circular + botón "Volver"
integrado, un solo card con `backdrop-blur`, recuadro destacado
verde-esmeralda para "Información de Última Solicitud", campos con
ícono+label, botón de guardar con degradado). El proyecto tiene **al menos
tres lenguajes visuales distintos conviviendo** entre páginas de
`solicitudes/*` — no hay un único estilo "correcto", se eligió éste
puntualmente porque el usuario lo pidió como referencia.

Nota aparte (no específica de Ampliación de Cupo): se aplicó el mismo
tratamiento a `FRONTEND/src/app/pedidos/mis-pedidos/page.tsx`, sumándole
además paginador (`TablePagination`) y exportar a Excel (`ResultsToolbar` +
`ExportExcelButton`, con `xlsx`) que no existían ahí — componentes
reutilizados de `listado-de-solicitudes`, no hay lógica nueva de fondo.

## Corrección 2026-08-01 (8): el "cupo actual" que ve el Ejecutivo no se guardaba en ningún lado

**Síntoma**: en `solicitud-ampliacion-cupo`, cuando el sistema no encuentra
el cupo actual automáticamente, obliga al Ejecutivo a escribirlo a mano
("Cupo Actual (Si no aparece arriba)") — pero ese valor (manual o
autocargado) no se enviaba en el payload a `POST /ampliacion-cupo`, ni
existía columna donde guardarlo. Se descartaba en silencio.

**Fix**: columna nueva `solicitudes.sol_cupo_actual_referencia`
(`decimal(18,2)`, migración
`20260801_agregar_cupo_actual_referencia_a_solicitudes.sql`). El frontend
ahora manda `cupoActualReferencia` en el `POST`; `AmpliacionCupoService.create()`
la guarda. Queda como registro histórico de cuál era el cupo al momento de
pedir la ampliación.

## Corrección 2026-08-01 (9): Camino 2 no bloqueaba solicitudes duplicadas

**Síntoma**: a diferencia del Camino 1 (que bloquea "Nueva solicitud" si el
cliente ya tiene una en trámite), un Ejecutivo podía crear varias
ampliaciones para el mismo cliente mientras una ya estaba pendiente/en
revisión — el selector de clientes (`GET /clientes/aprobados`) solo filtra
por tener alguna aprobación histórica, no por trámites activos.

**Fix**: `AmpliacionCupoService.create()` ahora revisa primero si el
cliente tiene alguna solicitud con `sol_estado_id IN (1,2,3)` (BORRADOR,
PENDIENTE, REVISION — mismo criterio que
`FRONTEND/src/constants/estado-solicitud.ts`) y, si la hay, responde
`409 ConflictException` con el número de esa solicitud. El frontend
muestra ese mensaje real en vez de un genérico ("Error al guardar").

De paso: `CreateAmpliacionCupoDto.nuevoCupo` ganó `@IsPositive()` (antes
`@IsNumber()` a secas permitía 0 o negativos).

## Corrección 2026-08-01 (10): Camino 2 no llenaba ninguna respuesta de formulario

**Síntoma**: como Camino 2 solo pide 3 campos (cupo actual, nuevo cupo,
justificación) y nunca pasa por el formulario dinámico, la solicitud
resultante no tenía ninguna fila en `Formulario_respuesta`. Consecuencia
directa: `useSolicitudCupoSolicitado` (usado en las 6 pantallas de
gestión/detalle para mostrar "Solicita cupo de crédito") busca la
respuesta a la pregunta `SOLICITA_CREDITO` — al no encontrar nada, mostraba
**"No"** aunque la solicitud sí pedía un cupo mayor.

**Fix**: `AmpliacionCupoService.guardarRespuestasFormularioAmpliacion()`
(privado), llamado dentro de la misma transacción de `create()`, inserta
directamente en `Formulario_respuesta` (mismo patrón ya usado por
`SolicitudesWorkflowService.guardarRespuestasConceptoEjecutivo`/
`guardarRespuestasUsoExclusivo`: resolver preguntas por `fp_codigo` y
opciones `SELECT` por `fpo_valor`, no por id fijo):

- `TIPO_SOLICITUD` → opción "Ampliacion de cupo".
- `SOLICITA_CREDITO` → opción "Si".
- `CUPO_SOLICITADO` → el monto nuevo (`dto.nuevoCupo`).

Si esto falla, no tumba la creación de la solicitud (columnas
`sol_cupo_solicitado`/etc. siguen siendo la fuente de verdad real).

## Corrección 2026-08-01 (11): las 6 pantallas de revisión no sabían mostrar una Ampliación de Cupo

**Encontrado al revisar en vivo la solicitud 21** (`sol_id=2192`, creada
por Camino 2): en `gestion-oficial-de-cumplimiento`, tanto "Solicita cupo
de crédito" como "Concepto del ejecutivo de negocios" salían vacíos/"No",
aunque la solicitud sí pedía $30. Antes del fix (10), la causa era que
ningún dato existía; el bloque "Concepto del ejecutivo" en particular
**siempre** va a salir vacío para Camino 2, porque esa solicitud nunca pasa
por el paso "Registrar Concepto" (se salta Ejecutivo de Negocios y
Auxiliar Servicio Cliente cuando no hay documentos vencidos — ver arriba).

**Fix**: componente nuevo y compartido
`FRONTEND/src/components/solicitudes/AmpliacionCupoResumen.tsx` — muestra
Cupo actual (referencia), Nuevo cupo solicitado y Justificación, leídos
directo de la solicitud (`sol_cupo_actual_referencia`,
`sol_cupo_solicitado`, `sol_justificacion_ampliacion`). Cada una de las 6
pantallas (`gestion-ejecutivo-negocios/registrar`,
`gestion-auxiliar-servicio-al-cliente/gestionar`,
`gestion-oficial-de-cumplimiento/gestionar`,
`gestion-comite-credito-1/gestionar`, `gestion-comite-credito-2/gestionar`,
`[id]/detalle`) ahora renderiza este bloque en vez de los antiguos
("Solicita cupo de crédito" + "Concepto del ejecutivo") cuando
`solicitud.sol_cupo_solicitado` no es nulo. Para solicitudes normales
(Camino 1 o `sol_cupo_solicitado = NULL`) el comportamiento no cambió.

## Corrección 2026-08-02 (12): "Nombre/Cargo del Funcionario" y "Cupo Solicitado" no deberían heredarse (Camino 1)

**Contexto**: a pedido del usuario, se analizó pregunta por pregunta del
formulario activo (v14, ~85 preguntas visibles) cuáles tenía sentido
heredar de la última solicitud aprobada al hacer una Ampliación de Cupo, y
cuáles no. El hallazgo más importante: **"Cupo Solicitado" se precargaba
con el monto ya aprobado** — si el cliente no lo tocaba, el formulario
reenviaba literalmente el mismo cupo que ya tenía, sin pedir nada nuevo.
"Nombre/Cargo del Funcionario que diligencia" también se precargaban,
aunque son datos sobre *quién llena el formulario hoy*, no del cliente.

**Fix**: migración
`20260802_quitar_precarga_funcionario_y_cupo_solicitado.sql` — pone
`fp_precarga_fuente = NULL` para `fp_codigo IN ('AUTO_Q1055', 'AUTO_Q1056',
'CUPO_SOLICITADO')` en preguntas activas (`fp_estado=1`), sin importar la
versión. Verificado en vivo (Playwright, cliente real): los 3 campos
quedan en blanco al entrar a "Nueva solicitud" como Ampliación de Cupo.

## Corrección 2026-08-02 (13): "Cupo Solicitado" sin validar contra el cupo actual (Camino 1)

Complemento del fix anterior: además de dejar el campo en blanco, se
agregó advertencia visual y validación de mínimo.

- Backend: `SolicitudesListadosService.obtenerUltimaSolicitudAprobada` y el
  endpoint `GET /solicitudes/cliente/:id/ultima-aprobada` ahora exponen
  `sol_cupo_aprobado` (antes el controller lo descartaba explícitamente al
  armar la respuesta — columna nunca declarada en el `return {}`).
- Frontend (`SolicitudFormContent.tsx` + `PreguntaRenderer.tsx`): la
  pregunta `CUPO_SOLICITADO` muestra un aviso ("Cupo actual: $X — el nuevo
  cupo debe ser mayor a este valor") y su regla de validación
  (`getValidationRules`) rechaza cualquier valor `< cupoActualAprobado`
  (permite igual, no solo estrictamente mayor — así lo pidió el usuario).
  `cupoActualAprobado` es `null` para Cliente Nuevo (no hay con qué
  comparar), así que ahí la regla no aplica.

**Pendiente, no implementado**: esta misma validación (nuevo cupo ≥ cupo
actual) falta en el Camino 2 (`solicitud-ampliacion-cupo/page.tsx` +
`CreateAmpliacionCupoDto`) — el Ejecutivo hoy puede guardar un monto menor
o igual sin ninguna advertencia.

## Corrección 2026-08-02 (14): Camino 2 solo llenaba 3 de ~60 respuestas del formulario

**Encontrado al revisar el fix (10)**: llenar solo `TIPO_SOLICITUD`,
`SOLICITA_CREDITO` y `CUPO_SOLICITADO` resuelve los widgets que miran esas
3 preguntas puntuales, pero deja **todo lo demás** del formulario vacío
(identificación, representante legal, PEPs, accionistas, contactos,
despachos, facturación electrónica...). Confirmado en vivo: una solicitud
de prueba por Camino 2 tenía 3 respuestas en `Formulario_respuesta` contra
60 de una solicitud normal diligenciada por el cliente. Esto es visible
para cualquier staff: la página `/solicitudes/[id]/detalle` enlaza el "PDF
de la solicitud" completo, que para Camino 2 salía casi todo en blanco (y
cualquier plantilla de documento con `{{representante_legal_nombre}}`,
como "Manifestación suscrita", también).

**Fix**: `AmpliacionCupoService.clonarRespuestasUltimaAprobada()` (privado,
llamado en la misma transacción de `create()`, después de (10)) — copia el
resto de respuestas de la última solicitud aprobada del cliente hacia la
nueva. Reutiliza `Formulario_pregunta.fp_precarga_fuente` (misma bandera
que ya controla el prefill del Camino 1) como único criterio de qué
copiar, así hereda automáticamente todas las exclusiones ya decididas
(documentos, firmas, notas, y desde el fix (12) también Nombre/Cargo del
Funcionario y Cupo Solicitado) sin duplicar esa lista en código. Traduce
`fp_id`/`fpo_id` de la versión vieja a la nueva vía `fp_codigo`/`fpo_codigo`
(mismo mecanismo de las correcciones (4) y (5) de más arriba), y agrupa por
"guardado más reciente" con la misma ventana de 2s que
`agruparUltimaRespuestaPorPregunta.ts` (para `MULTISELECT`).

Dos bugs propios encontrados y corregidos antes de dar el fix por bueno
(verificado en cada paso con solicitudes de prueba reales, luego
eliminadas):

1. El filtro `fp_precarga_fuente` se evaluaba sobre la fila de la
   **versión vieja** (la de la solicitud origen) en vez de la versión
   activa/nueva — como esa bandera es por versión y las migraciones que la
   activaron solo tocaron la versión activa, casi todo quedaba fuera
   (12 de ~40 respuestas esperadas). Corregido: el filtro se evalúa sobre
   la pregunta de la versión **destino**.
2. Una pregunta `DOCUMENTOS_TABLA` (RUT) tenía `fp_precarga_fuente` mal
   configurado en BD (dato inconsistente, no algo que la migración (12)
   haya tocado) y se colaba en el clonado. El frontend nunca lo sufre
   porque `usePrefillConfiguracion` filtra también por tipo de pregunta;
   se agregó el mismo filtro (`fp_tipo IN ('TEXTO','NUMERO','FECHA',
   'SELECT','SELECT_TABLA','TABLA','MULTISELECT')`) al clonado del
   backend, para no depender solo de la bandera.

**Verificado en vivo**: solicitud de prueba con 40 respuestas clonadas
(incluye `REP_LEGAL_TABLA`, PEPs, `MULTISELECT` con sus dos opciones, país/
departamento/ciudad, etc.), 0 de tipo `DOCUMENTOS_TABLA`, y las 3 preguntas
de (10) con valor fresco (no el heredado).

## Corrección 2026-08-02 (15): Camino 2 nunca capturaba consumo/toneladas mensuales proyectadas

**Encontrado a raíz de una pregunta del usuario** ("¿el ejecutivo llena las
toneladas proyectadas?"): en el flujo normal, `sol_consumo_mensual_proyectado`
y `sol_toneladas_proyectadas` son obligatorios en "Registrar Concepto"
(`gestion-ejecutivo-negocios/[id]/registrar`). Pero Camino 2 salta esa etapa
por completo cuando el cliente no tiene documentos vencidos (ver arriba), así
que para toda ampliación de cupo creada por esa vía esos dos campos quedaban
`NULL` **de forma permanente** — ningún revisor (Oficial de Cumplimiento,
Comité 1, Comité 2) llegaba a ver cuánto consumo/tonelaje proyectaba el
cliente antes de aprobar el nuevo cupo. No era solo un problema visual: el
bloque `AmpliacionCupoResumen` (fix 11) reemplaza por completo la sección
"Concepto del ejecutivo" para estas solicitudes, así que ni siquiera se veía
un "-" que llamara la atención sobre el dato faltante.

**Causa raíz**: el salto de etapa en Camino 2 estaba pensado solo para el
chequeo documental ("ya se verificaron los documentos vigentes"), pero de
paso se saltaba también la única pantalla que captura este dato comercial,
sin relación con el estado de los documentos.

**Fix**: se agregaron `consumoMensualProyectado`/`toneladasProyectadas` como
campos obligatorios (`@IsNumber() @IsPositive()`) al formulario de
`solicitud-ampliacion-cupo` y a `CreateAmpliacionCupoDto`. `AmpliacionCupoService.create()`
ahora guarda ambos en `solicitudes.sol_consumo_mensual_proyectado`/
`sol_toneladas_proyectadas` (columnas ya existentes, usadas por el flujo
normal) y además los refleja en `Formulario_respuesta` (preguntas "Consumo
mes proyectado"/"Toneladas mes proyectado" de la sección "CONCEPTO DEL
EJECUTIVO DE NEGOCIOS", resueltas por nombre igual que
`guardarRespuestasConceptoEjecutivo`), para que el PDF completo de la
solicitud también quede consistente. `AmpliacionCupoResumen` (las 6
pantallas) ahora muestra estos dos valores junto a Cupo actual/Nuevo
cupo/Justificación.

**Pendiente**: no se migró data histórica — las ampliaciones de cupo creadas
por Camino 2 antes de este fix siguen con estos dos campos en `NULL`.

## Corrección 2026-08-02 (16): "Documentos cargados por el cliente" salía vacío en Camino 2

**Encontrado en vivo, revisando la solicitud 21** (`sol_id=2192`, David
Prueba 2): la pantalla de Oficial de Cumplimiento mostraba "Esta solicitud
no tiene documentos cargados todavía" — engañoso, porque el cliente sí tiene
7 documentos vigentes, solo que viven en `Cliente_archivo` (su archivo
consolidado), no en `Solicitud_archivo` de esta solicitud puntual. Ya estaba
anotado como pendiente (ver corrección 2026-08-01 (11)).

**Causa**: `SolicitudesDocumentosService.obtenerDocumentosConVigencia`
siempre consultaba `Solicitud_archivo WHERE sa_sol_id = @0` — vacío por
diseño en Camino 2, porque esa solicitud nunca hace que el cliente vuelva a
subir nada (se reutilizan los documentos ya verificados).

**Fix**: si esa consulta no devuelve filas y la solicitud es una ampliación
de cupo (`sol_cupo_solicitado IS NOT NULL`), se hace un segundo query a
`Cliente_archivo` (JOIN `Tipos_documentos`) del cliente dueño de la
solicitud, mapeado a la misma forma de columnas que ya consume
`DocumentosCargadosSolicitud.tsx`. Verificado en vivo contra la BD real:
7 filas para el cliente 13606, con `sa_ruta_almacenamiento` como URL de
Cloudinary completa.

Dos detalles necesarios para que el resto del componente no se rompa:

- `sa_id`/`sa_sol_id`/`fp_id` quedan `NULL` a propósito — estos documentos
  no son un `Solicitud_archivo` de *esta* solicitud, así que no se pueden
  pedir por `GET /solicitudes/:id/respuestas/archivo/:saId` (ese endpoint
  exige `sa_sol_id = :id`; usar el `sa_id` real ahí daría 404). El
  `sa_id` que sí se manda es en realidad el `ca_id` de `Cliente_archivo`,
  solo para que la lista del frontend tenga una key única — no sirve para
  pedir el archivo por ese endpoint.
- Se agregó `sa_origen: 'cliente_archivo'` a estas filas.
  `getArchivoPreviewUrl` (`FRONTEND/src/lib/documentos-vigencia.util.ts`)
  ahora lo revisa antes de intentar la Prioridad 1 (el endpoint por `sa_id`)
  y, si viene de `Cliente_archivo`, usa directo `sa_ruta_almacenamiento`
  (ya es una URL pública de Cloudinary, funciona igual que la Prioridad 3 ya
  existente). `DocumentosCargadosSolicitud.tsx` además muestra un aviso
  ("Esta solicitud no pidió nuevos documentos — se muestran los vigentes del
  archivo del cliente...") para que el revisor entienda por qué.

**No cubierto por este fix**: el modo `editable` (usado hoy solo por
Auxiliar Servicio Cliente) permite "corregir fecha de emisión", que depende
de `fp_id` — como estas filas no tienen `fp_id`, ese botón simplemente no
aparece para documentos heredados. No es un problema práctico porque Camino
2 salta la etapa de ASC salvo que haya documentos vencidos (y si los hay, la
solicitud vuelve a etapa Cliente, no a ASC directamente).

## Corrección 2026-08-02 (17): los documentos deben quedar clonados en la solicitud, no solo mostrados por fallback

**A pedido del usuario**, tras el fix (16): el fallback de solo lectura
resuelve la pantalla, pero deja la solicitud "vacía por dentro" — sin filas
reales en `Solicitud_archivo`, cualquier otro consumidor que sí filtra
estrictamente por `sa_sol_id` (el PDF completo de la solicitud, "corregir
fecha de emisión" en ASC, "solicitar cambio de documento") seguía sin ver
nada. La solución de fondo es clonar los documentos hacia la solicitud
nueva, igual que ya se hace con las respuestas de formulario (fix 10/14).

**Fix**: `AmpliacionCupoService.clonarDocumentosClienteArchivo()` (privado,
misma transacción de `create()`), llamado solo cuando `!tieneDocumentosVencidos`
(el caso en que la solicitud salta directo a Oficial de Cumplimiento porque
esos documentos ya se dieron por verificados). Copia cada fila de
`Cliente_archivo` del cliente hacia `Solicitud_archivo` de la nueva
solicitud, resolviendo `sa_fp_id` por `Formulario_pregunta.fp_tipo_documento_id`
en la versión de formulario destino (misma tabla `Tipos_documentos` que ya
usa `ClienteArchivoService.promoverDocumentos` en sentido inverso). Si un
`tdo_id` del cliente no tiene pregunta `DOCUMENTOS_TABLA` viva en la versión
activa, ese documento puntual se omite (no debería pasar en la práctica,
pero no revienta la creación de la solicitud si pasa).

`Cliente_archivo` no guarda `sa_cloudinary_public_id`/`sa_resource_type`
(gap preexistente de esa tabla, fuera de alcance de este fix), así que las
filas clonadas quedan sin esas dos columnas — el endpoint de descarga
(`obtenerRespuestaArchivo`) ya maneja ese caso: si no hay
`sa_cloudinary_public_id`, usa `sa_ruta_almacenamiento` directo (la URL de
Cloudinary ya es pública), mismo comportamiento verificado en el fix (16).

El fallback de lectura del fix (16) queda como red de seguridad para
solicitudes ya creadas antes de este cambio (no se le hizo backfill
automático a todas), y para el caso borde de que el clonado falle a mitad
de camino (el `catch` no tumba la creación de la solicitud).

**Backfill puntual**: se aplicó la misma lógica a mano sobre la solicitud 21
(`sol_id=2192`, cliente 13606) — quedó con 7 filas reales en
`Solicitud_archivo` (antes 0), una por cada documento de su
`Cliente_archivo`. No se automatizó para el resto de solicitudes Camino 2
existentes; si aparece otro caso puntual, se repite el mismo patrón.

## Corrección 2026-08-02 (18): duplicación real de archivos, no solo referencia compartida

**A pedido del usuario**, tras el fix (17): clonar hacia `Solicitud_archivo`
dejaba la solicitud nueva con filas reales, pero todas apuntando a la
**misma URL física** que `Cliente_archivo` (y esta, a la vez, a la misma URL
que la solicitud original aprobada). Riesgo confirmado en código: reemplazar
o eliminar un documento en la solicitud original llama a
`storageService.destroy(public_id, resource_type)`
(`solicitudes-respuestas.service.ts:655-659`) — borra el asset de Cloudinary
de verdad, sin comprobar si alguna otra fila (`Cliente_archivo`, una
ampliación clonada) sigue apuntando a esa misma URL. Antes de este fix, ese
borrado habría dejado rotos todos los documentos "heredados" en silencio.

**Fix — cada reutilización duplica el asset en Cloudinary, no solo la URL:**

1. `IStorageService`/`CloudinaryStorageService`
   (`common/storage/storage.interface.ts`,
   `common/storage/providers/cloudinary-storage.service.ts`): método nuevo
   `duplicate(sourceUrl, { folder, filename, resourceType })` — usa
   `cloudinary.uploader.upload(sourceUrl, ...)`, que Cloudinary resuelve del
   lado del servidor (no hace falta bajar/subir el buffer por este backend).
   Devuelve un asset nuevo, con su propio `public_id`.
2. Migración `20260802_agregar_cloudinary_ids_cliente_archivo.sql`: agrega
   `ca_cloudinary_public_id`/`ca_resource_type` a `Cliente_archivo` (mismos
   tamaños que `Solicitud_archivo.sa_cloudinary_public_id`/`sa_resource_type`).
   Sin backfill — las filas ya promovidas antes de este fix se quedan sin
   estas dos columnas (siguen sirviendo por `ca_ruta_almacenamiento` directo,
   mismo fallback que ya usa `obtenerRespuestaArchivo`).
3. `ClienteArchivoService.promoverDocumentos` (promoción a CC2): en vez de
   copiar `sa_ruta_almacenamiento`, llama a `storageService.duplicate()` con
   destino `documentos-cliente/{cliente_id}/{tdo_id}/` — el "archivo
   maestro" del cliente queda con su propio asset. Si `duplicate()` falla
   para un documento puntual, ese documento se omite (`continue`) sin tumbar
   la promoción de los demás ni la aprobación en CC2.
4. `AmpliacionCupoService.clonarDocumentosClienteArchivo`: en vez de copiar
   `ca_ruta_almacenamiento`, duplica desde ahí hacia
   `documentos-solicitudes/{centro}/formularios/{numero_solicitud_nueva}/`
   (misma carpeta que usaría un documento subido normalmente a esa
   solicitud) — la ampliación de cupo queda con sus propios assets,
   independientes tanto del original como del archivo maestro del cliente.
   Requirió sumar `cop_nombre` (nombre del centro) a la consulta de
   `Detalle_cliente_centro` en `create()`, para armar la ruta de carpeta.

**Árbol resultante** (ejemplo real usado para verificar, cliente 13606):
```
documentos-solicitudes/PLANTA CARIBE (BQ)/formularios/20/...   ← original (solicitud aprobada)
documentos-cliente/13606/11/...                                 ← maestro (Cliente_archivo)
documentos-solicitudes/PLANTA CARIBE (BQ)/formularios/21/...   ← clon (Ampliación de Cupo)
```
Tres `public_id` de Cloudinary independientes para "el mismo" documento —
borrar cualquiera de los tres no afecta a los otros dos.

**Verificado en vivo, backend real corriendo (puerto 3003), sin mocks:**
- Prueba aislada de `cloudinary.uploader.upload(url, ...)`: duplicó
  correctamente un documento real a una carpeta de prueba con `public_id`
  nuevo; `destroy()` de la copia no afectó el original.
- `POST /api/ampliacion-cupo` real contra cliente 13605 (sin documentos
  vencidos, para forzar el camino "sin vencidos → OFC directo → clona
  documentos"): las 9 filas resultantes en `Solicitud_archivo` de la
  solicitud nueva (sol_id=2199) tienen cada una su propio
  `sa_cloudinary_public_id`, distinto entre sí y de los de `Cliente_archivo`.
  `Cliente_archivo` del cliente no se tocó (solo se lee, nunca se escribe
  desde este camino).
  Solicitud y los 9 archivos duplicados de la prueba se eliminaron después
  de verificar (`DELETE FROM solicitudes` + `cloudinary.uploader.destroy`
  por cada `public_id`).

**Backfill puntual de la solicitud 21** (fix 17): sus 7 filas en
`Solicitud_archivo` siguen apuntando a la misma URL que `Cliente_archivo`
(se insertaron *antes* de este fix, con el mecanismo viejo de copiar URL) —
no se re-duplicaron retroactivamente. Igual que con `Cliente_archivo`, no
hay backfill automático para filas ya creadas.

**Costo aceptado**: cada promoción a CC2 y cada Ampliación de Cupo por
Camino 2 ahora hacen una llamada de red a Cloudinary por documento, dentro
de la misma transacción de aprobación/creación — más tiempo de transacción
abierta y más almacenamiento usado (bytes duplicados por cada nivel de
reutilización) a cambio de que ningún borrado en un punto rompa otro.

## Bug encontrado 2026-08-02/03: botón "Volver" de 6 páginas apunta a "/solicitudes", que no tiene `page.tsx` propio

**Síntoma reportado por el usuario**: en `solicitud-ampliacion-cupo`, al hacer
clic en "Volver" la página falla (404 de Next.js).

**Causa**: el botón hace `router.push("/solicitudes")`, pero
`FRONTEND/src/app/solicitudes/` **no tiene ningún `page.tsx` en su raíz**,
solo subcarpetas (`nueva`, `listado-de-solicitudes`, etc.). Sin `page.tsx` ni
`not-found.tsx` propio, Next.js renderiza el 404 genérico. Confirmado en BD
que el módulo padre del menú "Solicitudes" (`pc_modulos.mod_id = 83`) sí tiene
`mod_ruta = '/solicitudes'` asignada, pero esa ruta nunca tuvo página real —
es un hueco preexistente, no una regresión de un cambio reciente.

**No es específico de esta página** — el mismo `router.push("/solicitudes")`
roto aparece en 6 archivos de `FRONTEND/src/app/solicitudes/`:
`solicitud-ampliacion-cupo/page.tsx` (líneas ~200 y ~317),
`mis-documentos-vencidos/page.tsx` (~76),
`listado-de-solicitudes/page.tsx` (~490, vía `PageHeaderCard.onBack`),
`rechazadas-ejecutivo/page.tsx` (~189),
`listado-documentos/page.tsx` (~353),
`gestion-ejecutivo-negocios/page.tsx` (~288, vía `PageHeaderCard.onBack`).

**Estado**: por pedido del usuario, no se corrigió el destino todavía — solo
se dejó un comentario `// TODO` en cada una de esas 7 líneas señalando el
problema. Pendiente decidir a dónde debe apuntar realmente ese "Volver" (el
candidato más natural es `/solicitudes/listado-de-solicitudes`, que sí existe
y es el listado general) y aplicar el cambio en los 6 archivos.

## Pendiente al cierre de esta sesión (2026-08-02)

- Validación "nuevo cupo ≥ cupo actual" en Camino 2 — ver fix (13).
- Destino roto del botón "Volver" en 6 páginas (`router.push("/solicitudes")`
  → 404) — ver sección de arriba.

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
