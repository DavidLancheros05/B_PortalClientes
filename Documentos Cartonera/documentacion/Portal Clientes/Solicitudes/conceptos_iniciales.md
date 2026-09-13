# Centro de operación de una solicitud: se deriva del ejecutivo del cliente (2026-09-12)

## Por qué la solicitud no "pertenece" a un centro

La solicitud de vinculación es un evento de una sola vez por cliente: le da
apertura al cliente **en la empresa**, no en un centro de operación
específico. Por eso nunca tuvo sentido que la solicitud cargara su propio
`co_id` — el centro es un atributo del cliente (a través de su ejecutivo
asignado), no de la solicitud. Eliminar `sol_co_id` fue correcto
conceptualmente; lo que quedó pendiente fue que 7 pantallas de gestión
interna dependían de ese campo para filtrar, y había que reemplazarlo por
el centro real (el del cliente), no resucitar la columna.

Distinto es el **equipo interno que gestiona** la solicitud (Oficial de
Cumplimiento, Auxiliar Servicio Cliente, Comités, Ejecutivo de Negocios):
esas personas sí pertenecen a un centro real (`Detalle_usuario_sucursal`,
no vestigial). Por eso las 7 pantallas de gestión sí necesitan filtrar por
centro — no porque la solicitud tenga uno propio, sino para que cada
equipo solo vea las solicitudes de los clientes que le corresponden a su
centro.

## Qué se arregló

Al eliminar `sol_co_id` de `solicitudes` (ver
`centro-operacion-vestigial-en-solicitudes.md`), 7 pantallas internas de
gestión quedaron rotas porque filtraban por ese campo, que ya no existe.
Se restauró el dato, pero calculado en el momento (no guardado en la
solicitud), siguiendo la cadena:

```
solicitud → cliente (sol_cliente_id) → ejecutivo del cliente (ejng_id) → centro del ejecutivo (cop_id)
```

Se descartó usar `sol_ejecutivo_id` (el ejecutivo asignado a la propia
solicitud) porque ese campo tiene interpretaciones inconsistentes en el
código existente (a veces es un `usr_id` de `usuarios`, a veces un `ejng_id`
de `Ejecutivo_negocio`, según la función). `Clientes.ejng_id` en cambio es
limpio: verificado que los 1670 clientes lo tienen asignado, sin nulos.

## El consecutivo del número de solicitud

Se guarda en la tabla `Consecutivo`, una sola fila por tipo
(`cons_ptc_id = 2` = "SOLICITUDES_VINCULACION"), con `cons_cop_id = NULL`
— ya no está partido por centro, es un único contador global compartido
por todos los centros (antes sí llevaba un contador separado por
`cons_cop_id`, se consolidó en la migración del 2026-09-12 arrancando en
el máximo ya emitido para no repetir números).

`cons_cop_id` es nullable y `NULL` significa "aplica a todos los centros"
(mismo criterio que `Festivos.fes_co_id` y
`param_dias_no_habiles_semana.dsh_co_id`) — no es un caso especial nuevo.
Verificado que **los 2 únicos tipos de consecutivo que existen**
(`Tipo_consecutivo`: PQRS y SOLICITUDES_VINCULACION) ya tienen
`cons_cop_id = NULL`, así que la columna queda sin usar hoy, pero
disponible por si algún tipo futuro sí necesitara numerar por centro.

## Tablas que se tocan (solo lectura, ningún cambio de esquema)

- `solicitudes` — de aquí sale `sol_cliente_id`.
- `clientes` — columna `ejng_id` (el vendedor asignado al cliente).
- `Ejecutivo_negocio` — columna `cop_id` (el centro del vendedor).
- `Centro_operacion` — `cop_nombre` (nombre a mostrar).

## Dónde (backend)

`B_PortalClientes/src/solicitudes/solicitudes-listados.service.ts`, se
agregó el mismo join (`clientes → Ejecutivo_negocio → Centro_operacion`) en
tres funciones, exponiendo el resultado como `sol_co_id` /
`centro_operacion_nombre` (mismos nombres que ya esperaba el frontend, cero
cambios ahí):

- `buildSolicitudesQuery` (usada por Oficial de Cumplimiento, Auxiliar
  Servicio Cliente, Comité Crédito 1, Comité Crédito 2, Corregir
  Formulario ASC).
- `getSolicitudesPendientesPorEjecutivoId` (Gestión Ejecutivo de Negocios).
- `getSolicitudesRechazadasPorEjecutivoId` (Rechazadas Ejecutivo).

Verificado en vivo contra la BD real: todas las solicitudes actuales
devuelven su centro sin nulos.

## Otro caso del mismo patrón: columnas de cliente duplicadas en `solicitudes` (2026-09-12)

`solicitudes` también tiene `sol_razon_social`, `sol_direccion`,
`sol_telefono` y `sol_nit_documento` — datos que ya existen con dueño claro
en otro lado: `Formulario_respuesta` (lo que el cliente declaró en esa
solicitud, vía las preguntas dinámicas "Razón social" fp_id 2986,
"Dirección" fp_id 2973/3010) o `Clientes` (el dato vigente del cliente).

**Verificado que son columnas muertas en la práctica**: en todas las
solicitudes revisadas, incluida una ya APROBADA (`SHIELD MAR S.A.S.`,
sol_id 2207), `sol_razon_social`/`sol_direccion`/`sol_telefono` están en
`NULL` — el código que las llenaría (`body.razonSocial`/`body.direccion`/
`body.telefono` en `solicitudes.service.ts`) nunca recibe esos valores del
frontend real. `sol_nit_documento` sí se llena, pero no por el formulario:
cae al respaldo `Cliente.cli_nro_identificacion` al crear la solicitud.

**Bug real que esto causaba**: `indicadores.service.ts` mostraba razón
social en blanco en las pantallas `/solicitudes/indicadores/solicitud` y
por área, porque leía `ISNULL(s.sol_razon_social, '')` — siempre vacío.

**Arreglado (2026-09-12)**: `indicadores.service.ts`
(`getSolicitudTimeline` y la consulta por área) ahora hace
`LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id` y lee
`c.cli_razon_social` / `c.cli_nro_identificacion` en vez de las columnas
muertas de `solicitudes`. Verificado en vivo: la solicitud 2207 ahora
devuelve "SHIELD MAR S.A.S." en vez de vacío.

## Mapa completo de dónde se tocan las 4 columnas (2026-09-12)

Revisado backend y frontend completos. Todo lo que queda es seguro de tocar
en una futura migración `DROP COLUMN` — nada depende de que tengan valor
real, porque en la práctica siempre están vacías (excepto `sol_nit_documento`,
que se llena por respaldo desde `Clientes`, no desde el formulario):

**Se pueden borrar/limpiar sin reemplazo (código muerto):**
- `solicitudes-respuestas.service.ts:375-386` — selecciona `sol_nit_documento`
  y lo desestructura, pero nunca lo usa después. Comentario de esa consulta
  todavía menciona "centro operación", resto de antes de esa limpieza.
- `useClienteSolicitudes.ts:12` (frontend) — el tipo declara
  `sol_razon_social?: string` pero nunca se lee, solo se usa
  `cliente_nombre`.

**Ya tienen el fallback correcto, no rompen si se borra la columna:**
- `historial-workflow.service.ts:112` —
  `COALESCE(c.cli_razon_social, s.sol_razon_social, 'Cliente')`: como
  `sol_razon_social` es siempre NULL, ya devuelve `cli_razon_social` hoy.
  Se puede simplificar quitando el término del medio cuando se borre la
  columna.
- `solicitudes-documentos.service.ts:24-49` (`obtenerSolicitud`, detrás de
  `GET /solicitudes/:id`) — hace `SELECT s.*` (trae las 4 columnas vacías)
  pero también junta `c.cli_razon_social AS cliente_nombre`, `c.cli_nro_identificacion
  AS cliente_nit`, `c.cli_direccion AS cliente_direccion`.
- `F_PortalClientes/src/app/solicitudes/[id]/detalle/page.tsx` — ya lee con
  fallback: `sol_razon_social || cliente_nombre`, `sol_nit_documento ||
  cliente_nit`, `sol_direccion || cliente_direccion`. Al borrar la columna
  simplemente siempre cae al segundo valor (el correcto). Única excepción:
  `sol_telefono` no tiene fallback y `Clientes` **no tiene columna de
  teléfono** — hoy siempre muestra "-" y seguirá igual, no hay dato real
  que rescatar.

**Solo escriben la columna al crear (quedaría en desuso, sin lectores reales):**
- `solicitudes.service.ts:268` (INSERT de solicitud de vinculación) — escribe
  las 4, usando `body.razonSocial/direccion/telefono` (nunca llegan del
  frontend real) y `Cliente.cli_nro_identificacion` como respaldo del NIT.
- `ampliacion-cupo.service.ts:171-185` (INSERT de ampliación de cupo) — solo
  escribe `sol_nit_documento`, también desde `Cliente.cli_nro_identificacion`.
- `solicitudes-listados.service.ts:295-298` (`getSolicitudesPendientesPorEjecutivoId`)
  — las selecciona y las devuelve, pero no encontré ninguna pantalla que las
  lea de esta respuesta puntual.
- `solicitud.entity.ts` (TypeORM) y `create-solicitud.dto.ts` — declaraciones
  de columna/DTO, se borran junto con la migración.

**Conclusión**: no hay ningún lector que dependa de un valor real en estas
4 columnas — todos los que "las usan" ya tienen (o caen en) el dato correcto
desde `Clientes`. Queda pendiente solo decidir y ejecutar la migración
`DROP COLUMN` + limpiar las referencias de arriba, mismo patrón que
`sol_co_id`.

## Ejecutado (2026-09-12): columnas eliminadas

Migración `migrations/20260912_eliminar_columnas_cliente_duplicadas_de_solicitudes.sql`
aplicada en local (sin índices ni FKs sobre estas columnas, DROP directo).
`solicitudes` pasó de 66 a 62 columnas.

Limpieza de código en el mismo commit lógico:
- `solicitud.entity.ts` — se quitan las 4 columnas TypeORM.
- `create-solicitud.dto.ts` — se quitan los 4 campos del DTO (el DTO
  tampoco tenía ningún caller real, verificado).
- `solicitudes.service.ts::crearSolicitud` — INSERT y params renumerados
  sin las 4 columnas; también se quitó `nroIdentificacionCliente` (solo se
  usaba para el respaldo de NIT que ya no existe) y se simplificó la
  consulta de cliente a solo `ejng_id`.
- `ampliacion-cupo.service.ts::create` — mismo ajuste: se quitó
  `sol_nit_documento` del INSERT, `nitCliente` y su columna en la consulta
  de cliente.
- `solicitudes-listados.service.ts::getSolicitudesPendientesPorEjecutivoId`
  — se quitan las 4 de su SELECT.
- `solicitudes-respuestas.service.ts` — se quitó el SELECT/destructure
  muerto de `sol_nit_documento`.
- `historial-workflow.service.ts` — `COALESCE` simplificado a
  `COALESCE(c.cli_razon_social, 'Cliente')`.
- Frontend: `[id]/detalle/page.tsx` ahora lee directo `cliente_nombre` /
  `cliente_nit` / `cliente_direccion` (ya venían del backend); se quitó del
  todo la fila "Teléfono" (no había fallback posible — `Clientes` tampoco
  tiene columna de teléfono, nunca hubo un dato real que mostrar ahí).
  `useClienteSolicitudes.ts` — se quitó el tipo muerto `sol_razon_social`.

Verificado: `tsc --noEmit` sin errores en ambos repos, y consulta en vivo
confirmando que las 4 columnas ya no existen en la tabla.

## Segunda ronda (2026-09-12): 10 columnas muertas más

Revisando el resto de columnas de `solicitudes` contra todo el código
(backend + frontend) aparecieron 2 familias más, completamente sin uso.
Antes de borrar se corrió `COUNT(*)` sobre **toda** la tabla (no solo una
muestra, a diferencia de la ronda anterior) confirmando NULL en el 100% de
las filas para las 10.

**Grupo 1 — "progreso de llenado del formulario"**, funcionalidad que
parece haberse diseñado en la BD pero nunca implementado en ningún
servicio (ni se lee ni se escribe en ningún lado, solo existían como
declaración en `solicitud.entity.ts`):
`sol_fecha_inicio_llenado`, `sol_fecha_ultima_respuesta`,
`sol_estado_llenado`, `sol_campos_completados`, `sol_campos_totales`,
`sol_formulario_progreso_porcentaje`.

**Grupo 2 — restos de un esquema de fechas más viejo** ("respuesta
comercial/financiera"), de antes de que existieran las 5 columnas
específicas por etapa (EJN/ASC/OFC/CC1/CC2):
`sol_fecha_estimada_respuesta` (sin sufijo), `sol_fecha_estimada_respuesta_financiera`,
`sol_fecha_real_respuesta_financiera`, `sol_fecha_real_respuesta_comercial`.
**Ojo**: `sol_fecha_estimada_respuesta_comercial` (sin "real", sin
"financiera") **no se tocó** — esa sí está viva: se escribe en
`solicitudes-workflow.service.ts::aprobarRechazarSolicitud` (cuando ASC
aprueba) y se usa como respaldo genérico en las 5 pantallas de "gestionar".

**Bug real encontrado en el camino**: `sol_fecha_real_respuesta_comercial`
se usaba para llenar el placeholder `{{fecha_aprobacion}}` del PDF de la
Carta de Vinculación (`F_PortalClientes/.../[id]/detalle/page.tsx`) — como
la columna siempre fue NULL, ese documento legal **siempre salía con la
fecha de aprobación en blanco**. Investigando el reemplazo se encontró la
causa raíz: la aprobación final en CC2 (`solicitudes-workflow.service.ts::guardarConceptoGenerico`)
**nunca inserta** en `Solicitudes_estados_hist` (solo 2 funciones del
workflow lo hacen, y esa no es una de ellas) — así que ni siquiera el
patrón ya existente en `getListado` (`MAX(seh_fecha_hora) WHERE seh_estado_id=5`)
funciona para una solicitud aprobada por ese camino real. El dato correcto
sí existe, en `sol_fecha_real_comite_credito_2` (se puebla siempre que CC2
resuelve, aprobado o no).

**Arreglado**: `solicitudes-documentos.service.ts::obtenerSolicitud` ahora
expone `fecha_aprobacion` como
`CASE WHEN sol_estado_id = 5 THEN COALESCE(historial, sol_fecha_real_comite_credito_2) END`
— usa el historial si algún día se llena, si no cae al dato real de CC2, y
da NULL si la solicitud no está aprobada (evita mostrar una fecha de
"aprobación" en una solicitud rechazada en CC2, que también tiene esa
columna poblada). Verificado en vivo: solicitud 2207 (aprobada) devuelve
"2026-08-12T13:11:59" en vez de NULL; solicitudes en otros estados dan NULL
correctamente. Frontend actualizado para leer `fecha_aprobacion` en vez de
la columna eliminada.

**Migración**: `migrations/20260912_eliminar_columnas_muertas_progreso_y_fechas_legacy.sql`,
aplicada en local. `solicitudes` pasó de 62 a 52 columnas. Cambios de
código: `solicitud.entity.ts` (7 columnas quitadas — las otras 3 nunca
estuvieron en la entidad, solo en SQL crudo), `solicitudes-listados.service.ts`
(2 puntos, se quitan de sus SELECT dejando viva `..._comercial` sin "real"),
`solicitud-listado-gestion.response.dto.ts`, y en el frontend
`listado-de-solicitudes/page.tsx` (tipo + 2 columnas del export a Excel que
salían siempre vacías) y `[id]/detalle/page.tsx` (tipos muertos + el fix de
`fecha_aprobacion` de arriba).

Verificado: `tsc --noEmit` sin errores en ambos repos, y consulta en vivo
confirmando 52 columnas sin ninguna de las 10 eliminadas.

## Pendiente (no tocado, a propósito)

`sol_fecha_estimada_respuesta_comercial` sigue viva y en uso real en las 5
pantallas de "gestionar" como respaldo genérico — su nombre no corresponde
a ninguna etapa real del workflow actual (EJN/ASC/OFC/CC1/CC2), pero
tocarla implica revisar esas 5 pantallas con más cuidado. Queda como tarea
aparte si se quiere seguir puliendo `solicitudes`.

## Las capas de datos de una solicitud, y un vacío real en la de "gestión" (2026-09-12)

Al analizar `sol_consumo_mensual_proyectado` (ver sección de arriba) salió
a la luz una pregunta más grande: en el flujo completo hay claramente
**tres capas de datos**, y solo dos de ellas tienen un lugar propio y bien
definido en el modelo. La tercera está repartida sin un dueño claro.

1. **Datos del cliente** (`Clientes`, `Detalle_cliente_centro`,
   `Ejecutivo_negocio`, etc.) — el dato vigente de la empresa/persona,
   independiente de cualquier solicitud puntual. Se edita en
   `parametrizacion/clientes`.

2. **Lo que el cliente declaró en el formulario** (`Formulario_respuesta`,
   una fila por `fp_id` respondido) — inmutable una vez enviado, es el
   registro histórico de "qué contestó el cliente en esta solicitud
   específica". Bien modelado: genérico, versionado por `fp_version`, no
   se pisa con nada.

3. **Lo que el equipo interno de la empresa contesta/decide al gestionar**
   (Ejecutivo de Negocios, Auxiliar Servicio Cliente, Oficial de
   Cumplimiento, Comité 1, Comité 2) — **esta es la capa sin un lugar
   propio claro.** Hoy está repartida en dos sitios, ninguno pensado para
   esto:

   - **Columnas mutables directas en `solicitudes`**: `sol_consumo_mensual_proyectado`
     y `sol_toneladas_proyectadas` (las pisa el Ejecutivo al gestionar, ver
     `solicitudes-workflow.service.ts:942`), `sol_cupo_aprobado`,
     `sol_plazo_pago`, `sol_forma_pago`, `sol_usuario_aprueba_condiciones`
     (las pisa CC2), `sol_observacion_ejn` (comentario del Ejecutivo). El
     problema: **se sobrescriben**. Si dos etapas tocaran el mismo campo
     (o si se necesitara auditar qué decidió cada una por separado), no
     queda rastro de los valores intermedios — solo el último.
   - **`solicitud_workflow_historial`** (`swh_sol_id`, `swh_etapa_id`,
     `swh_resultado_id`, `swh_usuario_id`, `swh_comentario`, `swh_fecha`,
     `swh_fecha_estimada`) — esta sí es una fila nueva por transición (no
     se pisa), pero solo guarda un **comentario de texto libre**, no los
     campos estructurados de la decisión (cupo, plazo, forma de pago,
     consumo ajustado). O sea: sabes *cuándo y quién* cambió de etapa y
     *qué escribió en el cuadro de comentario*, pero no *qué valores
     estructurados decidió* en esa transición puntual.

### Caso confirmado (no solo teórico): `sol_consumo_mensual_proyectado` mezcla "lo que pide el cliente" con "lo que ajusta el Ejecutivo"

Verificado en el propio frontend que esto ya pasa hoy, no es un riesgo
hipotético. En `F_PortalClientes/.../gestion-ejecutivo-negocios/[id]/registrar/page.tsx`:

- `solicitud.sol_consumo_mensual_proyectado` (el valor que puso el cliente
  al crear la solicitud) se muestra como **referencia de solo lectura**
  (línea 369) mientras el Ejecutivo gestiona.
- El Ejecutivo llena un **campo nuevo y separado** en el formulario
  (`registro.consumoMensual`) con su propio ajuste.
- Al guardar (línea 225), ese valor nuevo se envía como
  `consumo_mensual_proyectado` y **sobrescribe la misma columna** que tenía
  el valor original que se le mostró como referencia.

La UI ya está diseñada asumiendo que son dos conceptos distintos (por eso
muestra uno como referencia y pide el otro como input nuevo) — pero el
modelo de datos los colapsa en una sola columna mutable. Deberían ser
campos separados desde el inicio:

1. **Lo que pide/declara el cliente** — técnicamente sigue existiendo en
   `Formulario_respuesta` (no se pierde del todo), pero queda "escondido"
   ahí: cualquier reporte o pantalla que lea `sol_consumo_mensual_proyectado`
   directamente de `solicitudes` no tiene forma de saber si está viendo lo
   que dijo el cliente o lo que ya ajustó el Ejecutivo — el significado del
   dato cambia silenciosamente en el momento en que EJN gestiona.
2. **Lo que proyecta/ajusta el Ejecutivo** — hoy ocupa la misma columna que
   el punto 1.
3. **Lo que finalmente acepta el Comité** — ni siquiera existe un campo
   equivalente para esto. Solo existe `sol_cupo_aprobado` (un monto de
   cupo/crédito), que es un concepto relacionado pero **no es lo mismo**
   que "consumo mensual aceptado".

Mismo patrón aplica a `sol_toneladas_proyectadas` (se ajusta en la misma
línea 942, junto con el consumo).

**No se tocó código** — esto queda documentado como hallazgo confirmado,
pendiente de decidir si se separan en columnas explícitas (ej.
`sol_consumo_mensual_proyectado_cliente` vs. `sol_consumo_mensual_proyectado_ejecutivo`)
la próxima vez que se toque este flujo.

**El vacío**: no existe un equivalente a `Formulario_respuesta` para la
capa 3 — una tabla genérica (o específica por etapa) que capture, por cada
gestión, los valores estructurados que decidió esa etapa, ligados a esa
transición puntual (no a la solicitud en general). Hoy, para saber "qué
decidió el Comité de Crédito 1 sobre el cupo" después de que el Comité 2
también lo haya tocado, no hay forma de recuperarlo — el dato de CC1 ya se
sobrescribió.

**No se tocó nada de esto todavía** — es un hallazgo de diseño, no un bug
con síntoma visible hoy (nadie ha reportado necesitar ver la decisión de
una etapa después de que la siguiente la pisó). Si en algún momento se
quiere corregir, las dos opciones naturales serían: (a) agregar columnas
estructuradas a `solicitud_workflow_historial` (cupo/plazo/forma_pago/etc.
nullable, se llenan solo en la transición que corresponda), o (b) una
tabla nueva tipo `Solicitud_gestion_respuesta` (por etapa + campo,
genérica como `Formulario_respuesta`). La opción (a) es más simple y
reutiliza una tabla que ya existe y ya se llena en cada transición.

## Ejecutado (2026-09-12): separado "lo que pidió el cliente" de "lo que ajustó el Ejecutivo"

Para el caso confirmado de `sol_consumo_mensual_proyectado` (y
`sol_toneladas_proyectadas`) de la sección anterior, se aplicó el fix sin
crear columnas nuevas — el valor del cliente ya vivía en
`Formulario_respuesta`, solo había que dejar de pisarlo:

1. **`solicitudes.service.ts::crearSolicitud`** — se quitó
   `sol_consumo_mensual_proyectado` del INSERT inicial (antes se llenaba
   con `body.consumoMensualProyectado`, lo que el cliente puso en el
   formulario). Ahora esa columna queda `NULL` hasta que el Ejecutivo la
   gestione. Params renumerados (@0-@21, antes @0-@22). **No se tocó**
   `ampliacion-cupo.service.ts`: esa solicitud no tiene formulario dinámico
   detrás, ahí la columna sigue siendo la única fuente del dato.

2. **`solicitudes-documentos.service.ts::obtenerSolicitud`** — se agregaron
   dos campos nuevos calculados desde `Formulario_respuesta`, buscando por
   `fp_codigo` estable (no por `fp_id`, que puede cambiar entre versiones
   del formulario) y filtrando por `sol_formulario_version`:
   - `cliente_consumo_mensual_proyectado` (`fp_codigo = 'CONCEPTO_CONSUMO_PROYECTADO'`)
   - `cliente_toneladas_proyectadas` (`fp_codigo = 'CONCEPTO_TONELADAS_PROYECTADO'`)

3. **Frontend** (`gestion-ejecutivo-negocios/[id]/registrar/page.tsx`) — se
   agregó una nota de referencia bajo cada input ("El cliente declaró en
   el formulario: $X") usando los 2 campos nuevos. Antes el Ejecutivo
   llenaba estos campos sin ver ninguna referencia del valor original del
   cliente en el flujo normal de vinculación (el único lugar que mostraba
   un valor de referencia, `AmpliacionCupoResumen`, es exclusivo del flujo
   de Ampliación de Cupo — no se tocó, sigue usando la columna directa
   porque ahí sí es la única fuente).

Verificado: `tsc --noEmit` sin errores en ambos repos; la nueva subconsulta
probada en vivo contra la solicitud 2207 devuelve el valor correcto
(300,000,000 / 20 toneladas); el INSERT modificado se probó completo
dentro de una transacción con `ROLLBACK` (sin dejar datos de prueba),
confirmando que `sol_consumo_mensual_proyectado` queda en `NULL` al crear.
