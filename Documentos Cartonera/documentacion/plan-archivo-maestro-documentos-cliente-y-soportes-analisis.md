# Archivo maestro de documentos del cliente ("documentos definitivos")

## Contexto

Hoy `Solicitud_archivo` solo se relaciona con `sa_sol_id` (la solicitud) — no
existe ningún concepto de "documentos del cliente" que persista entre
solicitudes. Si el mismo cliente hace una solicitud nueva (o una ampliación
de cupo), tiene que volver a subir el RUT, la Cámara de Comercio, etc. desde
cero, aunque los haya subido hace un mes y sigan vigentes.

La idea (surgida al revisar el rediseño de "Mis Documentos" de hoy) es tener
dos niveles: los documentos de cada solicitud puntual (como hoy) y, aparte,
un archivo "definitivo" del cliente que se pueda reutilizar en solicitudes
futuras en vez de volver a pedir el mismo documento.

**Decisión de diseño (revisada 2026-07-13)**: el momento en que un documento
pasa a ser "definitivo" es cuando la solicitud queda **aprobada en Comité de
Crédito 2 (CC2)** — no antes. Diseño original (2026-07-12) proponía
promover ya en la etapa de Auxiliar de Servicio al Cliente (ASC), razonando
que un rechazo por crédito no debería botar documentos ya validados
administrativamente; se descartó ese criterio porque "Ampliación de Cupo"
solo tiene sentido para un cliente que **ya existe como tal**, y eso solo
ocurre al aprobarse en CC2 — un prospecto rechazado (por crédito o por lo
que sea) nunca llega a ser "cliente creado", así que no necesita ni debe
tener documentos archivados para reutilizar: su siguiente intento sigue
siendo "Cliente Nuevo", no una ampliación.

Esto ata la promoción de documentos al mismo punto donde ya se define
`sol_cupo_aprobado` (`solicitudes-workflow.service.ts`, dentro de
**`guardarConceptoGenerico`** — no `aprobarRechazarSolicitud`, esa es la
función del checklist de ASC; corregido tras confirmar en código el 2026-07-13,
línea 847 en adelante, `sol_cupo_aprobado` se setea en el bloque que arma
`updateSQL` a partir de `condiciones` — invocado desde `PUT
:id/concepto-comite-credito-2` — ver `FLUJO_ETAPAS.md`) — mismo bloque,
misma transacción (la que abre `queryRunner.startTransaction()` en la línea
866 y cierra con `commitTransaction()` en la línea 1036).

**Requiere también corregir un bug relacionado en el frontend**: hoy
`SolicitudFormContent.tsx` calcula
`tieneSolicitudesPrevias = ultimaSolicitud !== null` — es decir, preselecciona
"Ampliación de Cupo" con **cualquier** solicitud anterior, incluida una
rechazada. Con el criterio de arriba, esa condición debe cambiar a "el
cliente tiene al menos una solicitud **aprobada** (CC2)", no solo "existe
una solicitud anterior". Sin este fix, el frontend seguiría etiquetando como
"Ampliación de Cupo" a clientes que en realidad nunca llegaron a ser
clientes — inconsistente con la nueva regla de promoción.

## Diseño

### 1. Tabla nueva: `Cliente_archivo`

Migración nueva en `BACKEND/migrations/` (seguir el patrón de nombre
`YYYYMMDD_crear_cliente_archivo.sql`), espejo de `Solicitud_archivo` pero
scoped a cliente + tipo de documento en vez de a una solicitud:

```sql
CREATE TABLE Cliente_archivo (
  ca_id INT IDENTITY PRIMARY KEY,
  ca_cli_id INT NOT NULL REFERENCES Clientes(cli_id),
  ca_tdo_id INT NOT NULL REFERENCES Tipos_documentos(tdo_id),
  ca_sa_id INT NULL REFERENCES Solicitud_archivo(sa_id), -- de qué solicitud vino
  ca_nombre_original NVARCHAR(255) NOT NULL,
  ca_ruta_almacenamiento NVARCHAR(500) NOT NULL,
  ca_tipo_mime NVARCHAR(100) NULL,
  ca_fecha_emision DATE NULL,
  ca_fecha_vencimiento DATE NULL,
  ca_created_at DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT UQ_cliente_archivo_cli_tdo UNIQUE (ca_cli_id, ca_tdo_id) -- un solo "vigente" por tipo de documento
);
```

Un único registro vigente por `(cliente, tipo_documento)` — al promover uno
nuevo se reemplaza (`UPDATE` si ya existe la fila, no se acumula historial;
el historial real ya vive en `Solicitud_archivo`, esto es solo "cuál es el
vigente ahora mismo").

### 2. Backend — promoción automática al aprobar en CC2

En `BACKEND/src/solicitudes/solicitudes-workflow.service.ts`, dentro de
`guardarConceptoGenerico`, en el bloque que arma `updateSQL` a partir de
`condiciones` (el mismo que setea `sol_cupo_aprobado`, `sol_plazo_pago`,
etc., antes del `commitTransaction()` de la línea 1036): agregar, tras
confirmar la aprobación, un paso que
tome todos los `Solicitud_archivo` activos de esa solicitud con
`sa_requiere_cambio = 0` y `fp_tipo_documento_id IS NOT NULL`, y haga upsert
en `Cliente_archivo` por `(cli_id, tdo_id)` (usando `sol_cliente_id` de la
solicitud). Reusar la misma `queryRunner`/transacción ya abierta en esa
función — si algo falla, se revierte junto con el resto de la aprobación.
Si la solicitud se rechaza (en CC2 o en cualquier etapa anterior), no se
promueve nada.

Nuevo servicio pequeño `BACKEND/src/clientes/cliente-archivo.service.ts`
(o método en un servicio de clientes ya existente si lo hay) con:
- `promoverDocumentos(clienteId, solicitudId, queryRunner)` — el upsert de
  arriba.
- `obtenerArchivoCliente(clienteId)` — lista lo que el cliente tiene
  vigente, para ofrecerlo al iniciar una solicitud nueva.

### 3. Frontend — ofrecer reutilización al iniciar una solicitud nueva

En el flujo de "nueva solicitud" (`FRONTEND/src/app/solicitudes/nueva/`),
antes o al llegar a cada pregunta tipo `ARCHIVO`/`DOCUMENTOS_TABLA` con
`fp_tipo_documento_id`, consultar `obtenerArchivoCliente` y si existe un
documento vigente de ese tipo, mostrar una opción "Usar el que ya tienes en
archivo (subido el DD/MM/AAAA)" vs. "Subir uno nuevo" — no auto-rellenar sin
que el cliente confirme, para no ocultar que se está reutilizando algo viejo.

### 4. Camino adicional: Ejecutivo solicita la ampliación (pendiente de decidir)

Anotado 2026-07-13, **sin decidir todavía** — retomar antes de implementar
`Cliente_archivo`:

Una ampliación de cupo no solo puede surgir de que el cliente entre a "Nueva
solicitud" y el sistema la auto-detecte (sección de arriba). También puede
originarse porque el **Ejecutivo de Negocios la solicita** para un cliente
ya vinculado. En ese camino: si los documentos del cliente en
`Cliente_archivo` **no están vencidos**, el proceso avanza automáticamente
(sin volver a pedirle nada al cliente); si están vencidos, hay que pedirlos
de nuevo antes de continuar.

Esto es casi exactamente lo que ya intenta hacer el módulo huérfano
`BACKEND/src/ampliacion-cupo` (+ página
`FRONTEND/src/app/solicitudes/solicitud-ampliacion-cupo` (renombrada
2026-07-13, antes `-ejn`), ver
`documentacion/flujo-ampliacion-de-cupo.md`): su método
`verificarDocumentosVencidos` ya decide si la solicitud creada por el
Ejecutivo salta directo a Oficial de Cumplimiento (sin vencidos) o se queda
en etapa Cliente pidiendo documentos (vencidos) — solo que hoy chequea
`Solicitud_archivo.sa_fecha_vencimiento` de la última solicitud, no
`Cliente_archivo`, y la tabla `ampliacion_cupo` que usa no existe en la BD
real ni la página está enlazada a ningún menú (confirmado en vivo).

**Decidido 2026-07-13**: se reconecta la página existente en vez de crear
una entrada nueva — ya renombrada (`solicitud-ampliacion-cupo`, sin
`-ejn`). Pero **sin crear la tabla `ampliacion_cupo`**: se descartó por ser
casi toda redundante (`ac_estado_id`/`ac_etapa_actual_id`/`ac_resultado_etapa_id`
son copias de `solicitudes` que quedan congeladas en el momento de creación
y nadie las vuelve a actualizar — la fuente de verdad real siempre es la
fila de `solicitudes` vía `ac_solicitud_id`). Lo único que aportaba de
verdad esa tabla eran dos campos (`ac_nuevo_cupo`, `ac_justificacion`), que
en vez de vivir en una tabla aparte pasan a ser **columnas nuevas
directamente en `solicitudes`**: `sol_cupo_solicitado` (decimal) y
`sol_justificacion_ampliacion` (nvarchar) — un solo lugar con todo el
estado de la ampliación (etapa, resultado, cupo pedido, justificación), sin
copia que se desactualiza.

Checklist de lo que falta para que esta página funcione de punta a punta:

1. **Migración**: agregar `sol_cupo_solicitado` y
   `sol_justificacion_ampliacion` a `solicitudes` — no crear `ampliacion_cupo`.
2. **Backend** (`AmpliacionCupoService`/`Controller`): quitar la dependencia
   del repo TypeORM/`AmpliacionCupoEntity` (ya no hay tabla propia); el
   `create()` pasa a solo insertar en `solicitudes` incluyendo esos dos
   campos nuevos, manteniendo `verificarDocumentosVencidos` (por ahora sigue
   chequeando `Solicitud_archivo`; se adapta a `Cliente_archivo` cuando esa
   tabla exista — sección 1-3 de este documento, todavía no construida).
   `findAll`/`findByCliente` pasan a ser consultas sobre `solicitudes` con
   `sol_cupo_solicitado IS NOT NULL`, no sobre una tabla propia.
3. **Selector de clientes en la página**: hoy usa `clientesService.getAll()`
   (compartido por otras 12 páginas — no se puede filtrar ahí sin
   afectarlas). Falta un endpoint nuevo y específico (ej. `GET
   /clientes/aprobados`) que solo devuelva clientes con al menos una
   `solicitudes.sol_estado_id = 4` (APROBADA, ver
   `FRONTEND/src/constants/estado-solicitud.ts`) — reflejando que
   "Ampliación de Cupo" solo aplica a un cliente que ya fue aprobado y
   creado en el sistema, no a cualquier registro de `Clientes`.
4. Enlazar la página desde el menú del Ejecutivo de Negocios (hoy sigue sin
   ningún link, solo alcanzable por URL directa).

`Cliente_archivo` (secciones 1-3 de este documento) sigue siendo un bloque
aparte, más grande, todavía sin implementar — este camino EJN puede
avanzar primero usando `Solicitud_archivo` para el chequeo de vencidos, y
migrar a `Cliente_archivo` cuando esa tabla exista.

## Fuera de alcance por ahora (anotarlo pero no implementarlo en esta pasada)

- Ampliación de cupo (`BACKEND/src/ampliacion-cupo/`) también sube
  documentos y sería otro beneficiario natural de reutilizar el archivo del
  cliente — no se investigó a fondo ese flujo, queda para una iteración
  posterior una vez que el mecanismo base funcione en "nueva solicitud".
- Qué pasa si el cliente sube un documento *distinto* al que tenía en
  archivo dentro de una solicitud nueva (¿se sobreescribe el archivo
  definitivo automáticamente, o solo tras pasar ASC de nuevo?) — con el
  diseño de arriba, la respuesta ya es consistente (solo se promueve tras
  pasar ASC), pero vale la pena confirmarlo explícitamente con el usuario
  antes de implementar.

## Verificación (cuando se implemente)

1. Migración: `node scripts/db-query.mjs migrations/<archivo>.sql`, confirmar
   que `Cliente_archivo` existe con el UNIQUE constraint.
2. Aprobar una solicitud de prueba hasta llegar a CC2 y aprobarla ahí
   (`PUT :id/concepto-comite-credito-2` con `aprobado: true` y condiciones,
   vía `mint-jwt.mjs` con un usuario CC2) y verificar con `db-query.mjs` que
   aparecen filas nuevas en `Cliente_archivo` para los documentos no
   marcados `sa_requiere_cambio`. Confirmar también que una solicitud
   **rechazada** en CC2 (o en cualquier etapa anterior) no genera filas en
   `Cliente_archivo`.
3. Iniciar una solicitud nueva para ese mismo cliente y confirmar en el
   navegador que aparece la opción de reutilizar el documento ya archivado,
   y que la pregunta "Tipo de solicitud" solo se preselecciona como
   "Ampliación de Cupo" cuando el cliente tiene una solicitud aprobada
   (no con una solicitud previa rechazada).

---

# Soportes de análisis del Oficial de Cumplimiento (adjuntar evidencia propia)

## Contexto

En `/solicitudes/gestion-oficial-de-cumplimiento/[id]/gestionar`, el Oficial
de Cumplimiento solo puede dejar un comentario de texto
(`registro.observacionesCumplimiento`) al aprobar/rechazar — no existe forma
de adjuntar sus propios soportes (capturas, reportes de listas
restrictivas, etc.) que respalden su análisis. Es un archivo nuevo, no un
documento del cliente: hoy `Solicitud_archivo` solo modela documentos
subidos por el cliente, ligados a una pregunta del formulario
(`sa_fp_id` → `Formulario_pregunta`), lo cual no encaja con "un archivo que
sube internamente un revisor, sin pregunta asociada".

Se investigó el mecanismo de subida existente para reusarlo: `POST
/solicitudes/respuestas/archivo`
(`solicitudes.controller.ts:865`, `FileInterceptor('archivo')`) llama a
`solicitudesRespuestasService.guardarRespuestaArchivo`
(`solicitudes-respuestas.service.ts:218`), que sube el buffer con
`this.storageService.upload(file.buffer, { folder, filename, mimetype })`
(abstracción de almacenamiento ya usada para Cloudinary) y guarda la fila en
`Solicitud_archivo`. Se reutiliza `storageService.upload` tal cual; lo que
cambia es la tabla destino (no `Solicitud_archivo`, ver abajo) y que no
requiere `fp_id`.

Los códigos de etapa reales están en `workflow_etapas`
(`wet_codigo`: CLI, EJN, ASC, OFC, CC1, CC2 — confirmado en vivo con
`db-query.mjs`) — el nuevo campo se relaciona por `wet_id`, no por texto
libre, para quedar consistente con el resto del esquema.

## Diseño

### 1. Tabla nueva: `Solicitud_soporte_analisis`

Migración nueva en `BACKEND/migrations/YYYYMMDD_crear_soportes_analisis.sql`:

```sql
CREATE TABLE Solicitud_soporte_analisis (
  ssa_id INT IDENTITY PRIMARY KEY,
  ssa_sol_id INT NOT NULL REFERENCES solicitudes(sol_id),
  ssa_wet_id INT NOT NULL REFERENCES workflow_etapas(wet_id),
  ssa_nombre_original NVARCHAR(255) NOT NULL,
  ssa_ruta_almacenamiento NVARCHAR(500) NOT NULL,
  ssa_tipo_mime NVARCHAR(100) NULL,
  ssa_tamano_bytes INT NULL,
  ssa_usuario_id INT NOT NULL,
  ssa_estado VARCHAR(20) NOT NULL DEFAULT 'activo',
  ssa_created_at DATETIME NOT NULL DEFAULT GETDATE()
);
```

Genérica por etapa (`ssa_wet_id`) a propósito: hoy se usa solo para OFC, pero
ASC/CC1/CC2 previsiblemente van a querer lo mismo — mismo patrón que
`DocumentosCargadosSolicitud`, pensado para reusarse.

### 2. Backend

Nuevos endpoints en `solicitudes.controller.ts`, junto a
`respuestas/archivo` (mismo patrón, sin `fp_id`):

- `POST :id/soportes-analisis` — `@UseInterceptors(FileInterceptor('archivo'))`,
  body `{ wet_id }`, sube con `storageService.upload` a una carpeta
  `documentos-solicitudes/{centro}/soportes/{numero_solicitud}` (mismo
  esquema de carpetas que ya arma `guardarRespuestaArchivo`), inserta la
  fila con `usr_id` del token.
- `GET :id/soportes-analisis?wet_id=4` — lista soportes activos.
- `DELETE :id/soportes-analisis/:ssaId` — soft delete (`ssa_estado =
  'inactivo'`, mismo mecanismo que `Solicitud_archivo`).

Nuevo método en `solicitudes-documentos.service.ts` (mismo servicio que ya
tiene `obtenerDocumentosConVigencia`) o un servicio pequeño aparte
`soportes-analisis.service.ts` si se prefiere no mezclar conceptos.

### 3. Frontend

Nuevo componente `FRONTEND/src/components/SoportesAnalisis.tsx` (mismo
espíritu que `DocumentosCargadosSolicitud.tsx`, pero con input de carga +
botón eliminar, ya que estos si los sube/borra el usuario interno):
props `solicitudId`, `wetId`. Sube el archivo de inmediato al
seleccionarlo (igual que `ArchivoField`), sin esperar a "Guardar decisión".

Insertar en `gestion-oficial-de-cumplimiento/[id]/gestionar/page.tsx`,
dentro de la columna del formulario (`col-span-2`/`flex-1`), cerca de
"Observaciones de Cumplimiento" — con `wetId` fijo en 4 (OFC).

## Verificación

1. Migración: `node scripts/db-query.mjs migrations/<archivo>.sql`.
2. Subir un soporte vía `curl -F` con `mint-jwt.mjs` (rol OFC o ADMIN) contra
   `POST /solicitudes/2174/soportes-analisis`, confirmar 200 y fila nueva en
   `Solicitud_soporte_analisis` con `db-query.mjs`.
3. `GET /solicitudes/2174/soportes-analisis?wet_id=4` devuelve el archivo
   recién subido.
4. En el navegador, entrar a
   `/solicitudes/gestion-oficial-de-cumplimiento/2174/gestionar`, subir un
   archivo desde la UI nueva, confirmar que aparece en la lista y que "Ver"
   abre el archivo real.

---

# Persistir la Carta de Vinculación en "Mis Documentos" del cliente

## Contexto

Hoy la Carta de Vinculación (el PDF con las condiciones pactadas: cupo,
plazo, forma de pago) **nunca se guarda en ningún lado** — solo se genera en
memoria y se descarta. Por eso el cliente no la ve en "Mis Documentos"
aunque ya se la hayan aprobado.

Confirmado en código (2026-07-13): en
`BACKEND/src/solicitudes/solicitudes-workflow.service.ts`,
`generarPDFCarta` (línea 1538) arma el PDF con `pdfkit` y resuelve un
`Buffer` en memoria (`doc.on('end', () => resolve(Buffer.concat(chunks)))`,
línea 1554) — no llama a `storageService`, no hace ningún `INSERT`.
`enviarCartaVinculacionPorCorreo` (línea 1354) llama a `generarPDFCarta` en
la línea 1431 y usa el buffer únicamente como adjunto de
`mailService.enviarCorreo` (línea 1455) — el PDF se genera, se manda por
correo y se pierde. Búsqueda por `storageService`/`INSERT INTO
Solicitud_archivo` en todo el archivo no arroja nada.

Esta función se invoca desde `guardarConceptoGenerico`, en el bloque `if
(aprobado && etapaActualCodigo === 'CC2')` (línea 1038) — pero **después**
de `commitTransaction()` (línea 1036), dentro de su propio `try/catch` que
solo loguea el error sin revertir la aprobación (líneas 1038-1044). Es
decir: a diferencia de la promoción a `Cliente_archivo` (sección anterior,
que sí va *dentro* de la transacción de aprobación), el envío de la carta ya
está diseñado como "best-effort, no bloquea ni revierte la aprobación si
falla" — persistir el PDF debe seguir el mismo patrón, no meterse en la
transacción.

**Por qué esto no es lo mismo que `Cliente_archivo`**: `Cliente_archivo` es
*por cliente* (un documento vigente que se reutiliza entre solicitudes
futuras — el RUT de hoy sirve para la solicitud del año que viene). La
Carta de Vinculación es *por solicitud*: cada solicitud aprobada genera la
suya propia, con las condiciones pactadas en esa aprobación puntual — no
hay "una carta vigente del cliente" que tenga sentido reutilizar. El
problema técnico de fondo es el mismo que ya resolviste para "Soportes de
análisis" (sección anterior): `Solicitud_archivo.fp_id` es `NOT NULL` y
exige una `Formulario_pregunta` real detrás, y un PDF que genera el sistema
al aprobar no tiene ninguna. Diferencia con Soportes: esos son de uso
interno (solo los ve el OFC); la carta sí tiene que ser visible para el
cliente en "Mis Documentos", que hoy arma su lista solo desde
`Solicitud_archivo` (`obtenerDocumentosConVigencia`,
`solicitudes-documentos.service.ts:84-109`, `FROM Solicitud_archivo sa` —
confirmado que no itera el catálogo `Tipos_documentos`, solo lo usa para
enriquecer filas ya existentes).

## Diseño

### 1. Tabla nueva: `Solicitud_carta_vinculacion`

Migración nueva en `BACKEND/migrations/YYYYMMDD_crear_carta_vinculacion.sql`,
mismo espíritu que `Solicitud_soporte_analisis` pero sin `wet_id` (siempre
se genera en la misma etapa, CC2) y con un único registro por solicitud:

```sql
CREATE TABLE Solicitud_carta_vinculacion (
  scv_id INT IDENTITY PRIMARY KEY,
  scv_sol_id INT NOT NULL REFERENCES solicitudes(sol_id),
  scv_nombre_original NVARCHAR(255) NOT NULL,
  scv_ruta_almacenamiento NVARCHAR(500) NOT NULL,
  scv_tipo_mime NVARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  scv_tamano_bytes INT NULL,
  scv_created_at DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT UQ_carta_vinculacion_sol UNIQUE (scv_sol_id)
);
```

`UNIQUE (scv_sol_id)`: una carta por solicitud. Hoy no existe ningún
endpoint de "reenviar carta" (confirmado por grep: `enviarCartaVinculacionPorCorreo`
solo se invoca desde la línea 1040, un único call site) — si en el futuro se
agrega un reenvío, este diseño asume que regenerarla debe hacer `UPDATE` de
la misma fila, no acumular versiones.

### 2. Backend — persistir al generar la carta (best-effort, fuera de la transacción de aprobación)

En `enviarCartaVinculacionPorCorreo`, justo después de obtener `pdfBuffer`
(línea 1431-1435) y antes o en paralelo al envío del correo: subir el
buffer con `storageService.upload` (mismo patrón que
`guardarRespuestaArchivo`, `solicitudes-respuestas.service.ts:293`) a una
carpeta `documentos-solicitudes/{centro}/cartas/{numero_solicitud}` —
requiere agregar el join a `Centro_operacion` en el SELECT de la línea
1365-1378, que hoy no trae `cop_nombre`. Insertar (o `UPDATE` si ya existe
por `scv_sol_id`) la fila en `Solicitud_carta_vinculacion`. Envolver en su
propio `try/catch` independiente del envío de correo — si el storage falla,
igual debe intentarse enviar el correo con el buffer que ya se tiene en
memoria, y viceversa; ninguno de los dos debe revertir la aprobación (ya
comprobado que el caller no hace rollback si esto lanza).

### 3. Backend — exponerla en "Mis Documentos"

Extender `obtenerDocumentosConVigencia`
(`solicitudes-documentos.service.ts:84-109`) con un `UNION ALL` que traiga
la fila de `Solicitud_carta_vinculacion` (si existe) mapeada a las mismas
columnas que ya consume el frontend (`sa_id`, `sa_sol_id`, `fp_id`,
`sa_nombre_original`, `sa_tipo_mime`, `sa_ruta_almacenamiento`, `sa_estado`,
`fecha_carga`, `tdo_nombre`, etc.), con `fp_id`/`tdo_id` en `NULL` y
`tdo_nombre` como literal `'Carta de Vinculación Comercial'`. Así el
frontend (`FRONTEND/src/app/solicitudes/mis-documentos/page.tsx`, que ya
hace fallback `doc.tdo_nombre || doc.sa_nombre_original` en la línea 671)
la renderiza sin cambios de código, solo con el cambio de query.

**Pendiente de decidir**: hoy no vi un guard explícito en
`mis-documentos/page.tsx` que oculte los botones "Reemplazar"/"Eliminar"
según si la fila tiene o no `fp_id`/`tdo_id` — hay que revisar esas
condiciones (cerca de las líneas 700-780) antes de implementar, porque el
cliente no debería poder "reemplazar" ni "eliminar" la carta que el sistema
emitió.

## Verificación (cuando se implemente)

1. Migración: `node scripts/db-query.mjs migrations/<archivo>.sql`, confirmar
   que `Solicitud_carta_vinculacion` existe con el `UNIQUE` constraint.
2. Aprobar una solicitud de prueba en CC2 (`PUT :id/concepto-comite-credito-2`
   con `aprobado: true` y condiciones, vía `mint-jwt.mjs`) y confirmar con
   `db-query.mjs` que aparece una fila nueva en `Solicitud_carta_vinculacion`
   con `scv_sol_id` correcto, y que el correo se sigue enviando igual que
   hoy.
3. `GET /solicitudes/mis-documentos` (con JWT de ese cliente) debe incluir
   la carta en la respuesta, con `tdo_nombre = 'Carta de Vinculación
   Comercial'`.
4. En el navegador, como CLIENTE, entrar a "Mis Documentos" de esa
   solicitud y confirmar que la carta aparece y que "Ver" abre el PDF real
   (mismo contenido que llegó por correo), y que no tiene botones de
   reemplazar/eliminar.
