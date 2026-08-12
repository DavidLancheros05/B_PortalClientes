# Almacenamiento de archivos — dónde quedan y estado actual (2026-07-13, actualizado 2026-08-09)

**Actualización 2026-08-09 (mañana)**: la sección "No existe una carpeta del
cliente" y "Por qué hay tres tablas" quedaron desactualizadas —
`Cliente_archivo` ya se implementó (ver ambas secciones, corregidas abajo).
El resto del documento (arquitectura de storage, convención de carpetas,
los tres puntos de subida originales) se verificó contra el código actual y
sigue vigente tal cual.

**Actualización 2026-08-09 (tarde)**: se confirmó que `centro_operación` es
vestigial para las solicitudes de cliente (ver
`centro-operacion-vestigial-en-solicitudes.md`) — se quitó el segmento
`{centro_operación}` de **todas** las rutas de Cloudinary listadas abajo.
Los archivos ya subidos no se movieron (siguen en su ruta vieja con el
nombre del centro); esto solo aplica hacia adelante. De paso, los dos
puntos de subida que tenían la carpeta base escrita a mano
(`cliente-archivo.service.ts`, `ampliacion-cupo.service.ts`) se conectaron
a `CarpetaAlmacenamientoService`/tabla `Urls`, cerrando el pendiente que
señalaba la sección "Problemas y mejoras" más abajo.

## Dónde se guardan hoy

Los archivos **no se guardan en disco**: el backend sube todo a **Cloudinary**
a través de un proveedor intercambiable
(`BACKEND/src/common/storage/`, interfaz `IStorageService`,
`STORAGE_SERVICE` inyectado por `StorageModule`). El único proveedor
implementado hoy es `CloudinaryStorageService`
(`providers/cloudinary-storage.service.ts`); cambiar de proveedor (disco
local, S3, etc.) solo requiere una nueva clase que implemente
`IStorageService` y cambiar el `useClass` en `storage.module.ts` — ningún
otro archivo del sistema necesita tocarse.

Convención de carpetas dentro de Cloudinary (parámetro `folder` al llamar
`storageService.upload`):

- Documentos del cliente ligados a una pregunta del formulario
  (tabla `Solicitud_archivo`, subidos desde
  `solicitudes-respuestas.service.ts::guardarRespuestaArchivo`):
  `documentos-solicitudes/formularios/{numero_solicitud}/`
- Soportes de análisis subidos por personal interno (Oficial de
  Cumplimiento, etc.), no ligados a ninguna pregunta del formulario
  (tabla `Solicitud_soporte_analisis`, `solicitudes-documentos.service.ts::subirSoporteAnalisis`):
  `documentos-solicitudes/soportes/{numero_solicitud}/`
- Carta de Vinculación Comercial, generada por el sistema (no subida por
  nadie) al aprobarse la solicitud en Comité de Crédito 2 (tabla
  `Solicitud_carta_vinculacion`, `solicitudes-workflow.service.ts::enviarCartaVinculacionPorCorreo`,
  agregado 2026-07-13):
  `documentos-solicitudes/cartas/{numero_solicitud}/` — **no verificado
  hoy** si a esta ruta también se le quitó el centro (no se tocó
  `enviarCartaVinculacionPorCorreo` en la sesión del 2026-08-09, solo los
  cuatro puntos listados en la actualización de arriba).

Los tres casos usan `resource_type: 'raw'` para todo lo que no sea imagen
(los PDF se fuerzan a `raw` porque Cloudinary los clasifica por defecto
como `image` bajo `auto`, y las cuentas nuevas bloquean servir PDF/ZIP como
`image` con 401).

**Agregado 2026-08-09 — dos puntos de subida más, no listados arriba:**

- **Evidencia por persona** (fotos/documentos de una fila puntual de una
  pregunta tipo `TABLA` — representante legal, suplentes, composición
  accionaria — en la pantalla de Gestión de Oficial de Cumplimiento):
  tabla nueva `Solicitud_evidencia_persona` (`sep_`, migración
  `migrations/20260804_crear_solicitud_evidencia_persona.sql`), subido
  desde `solicitudes-documentos.service.ts` (el método de al lado de
  `subirSoporteAnalisis`). Carpeta:
  `documentos-solicitudes/evidencias-personas/{numero_solicitud}/`.
  Clave: `sep_sol_id` + `sep_fp_id` + `sep_fila_index` — este último ancla
  el archivo a una fila específica de la pregunta `TABLA` (ver
  `problemas.md`, sección sobre el problema de mapear filas de `TABLA`
  hacia SIESA — este es el primer precedente real de "archivo indexado por
  fila" en el sistema).
- **PQRS**: adjuntos subidos por cliente o interno en una PQRS
  (`src/pqrs/pqrs.service.ts::subirAdjunto`, tabla `PQRSAdjuntoEntity` /
  `pa_`). Carpeta: `pqrs/{pqrs_numero}/` — convención completamente
  distinta a la de solicitudes (sin centro de operación, sin subcarpeta por
  tipo).

## Carpeta base ahora se resuelve desde la tabla `Urls` (2026-08-09)

Hasta el 2026-08-09, cada punto de subida tenía el prefijo de carpeta
(`documentos-solicitudes` / `pqrs`) escrito literal en el código — el
"problema" que ya señalaba la sección de mejoras más abajo. Se resolvió
parcialmente conectándolo a una tabla externa que ya existía en la misma
base de datos compartida, `Urls` (usada hasta ahora por otro sistema interno
—probablemente "SISCOM"— para registrar rutas de red UNC, ej.
`\\10.238.28.181\arc_siscom\Muestras\`; sin relación previa con el Portal de
Clientes, sin ninguna fila de este código en migraciones ni referencias en
`src/`).

Se agregaron dos filas nuevas a `Urls` (sin migración — insertadas
directamente en la BD en vivo, `url_id` 1004 y 1005):

| url_id | url_nombre | url_tipo_archivo | url_recurso_serv | url_usuario |
|---|---|---|---|---|
| 1004 | `documentos-solicitudes/` | 5 | `true` | `david.lancheros` |
| 1005 | `pqrs/` | 6 | `true` | `david.lancheros` |

Los códigos `5` y `6` de `url_tipo_archivo` se eligieron a mano (siguiente
libre tras los existentes `0`/`1`/`2`/`4` del otro sistema — no hay catálogo
formal de esta columna en ningún lado del código).

**`src/common/storage/carpeta-almacenamiento.service.ts`** (nuevo,
`CarpetaAlmacenamientoService`, exportado desde `StorageModule`) hace
`SELECT TOP 1 url_nombre FROM Urls WHERE url_tipo_archivo = @0` y devuelve
esa carpeta base; si la fila no existe o la consulta falla, cae a un valor
por defecto hardcodeado (`documentos-solicitudes/` / `pqrs/`) para que una
fila borrada por error en `Urls` no tumbe la subida de archivos. Constantes
`TIPO_ARCHIVO_URLS.SOLICITUDES = 5` / `TIPO_ARCHIVO_URLS.PQRS = 6` en el
mismo archivo.

Los puntos de subida (`guardarRespuestaArchivo`, `subirSoporteAnalisis`,
evidencia por persona, `enviarCartaVinculacionPorCorreo` y
`pqrs.service.ts::subirAdjunto`) arman la carpeta como
`` `${await carpetaAlmacenamiento.obtenerBase(TIPO)}${resto}` `` en vez del
template string completo a mano — el prefijo viene de `Urls`, el resto
(`{subcarpeta}/{numero}`) lo sigue armando cada servicio, porque `Urls` no
sabe nada de números de solicitud.

**Actualización 2026-08-09 (tarde)**: se sumaron dos puntos más a este
mismo patrón — `cliente-archivo.service.ts::reutilizarEnSolicitud` y
`ampliacion-cupo.service.ts::clonarDocumentosClienteArchivo` tenían
`documentos-solicitudes/` escrito literal en el código (no pasaban por
`Urls`); ahora también usan `carpetaAlmacenamiento.obtenerBase(TIPO_ARCHIVO_URLS.SOLICITUDES)`.
Y en los siete puntos ya no aparece `{centro}` en el "resto" — se quitó por
completo (ver `centro-operacion-vestigial-en-solicitudes.md`).

**Importante — esto es distinto de "recurso navegable":** `url_nombre`
guarda el prefijo de carpeta usable por el SDK de Cloudinary
(`folder: 'documentos-solicitudes/...'`), no una URL que se pueda abrir en
el navegador. Se probó primero con la URL de Cloudinary Media Library
(`https://console.cloudinary.com/console/media_library/folders/...`) para
que fuera "abrible" como las rutas de red existentes, pero esa URL no sirve
como parámetro de subida — se revirtió al prefijo de carpeta plano.

## No existe una "carpeta del cliente" en Cloudinary — pero sí un archivo maestro en BD (implementado 2026-08-02)

En **Cloudinary** la organización sigue siendo siempre por **centro de
operación + número de solicitud**, nunca por `cliente_id` — eso no cambió.

Pero a nivel de **base de datos** ya no es cierto que no exista un
repositorio único de "documentos del cliente": la tabla `Cliente_archivo`
(`ca_`, migración `migrations/20260802_crear_cliente_archivo.sql`) guarda
**un documento vigente por `(cliente, tipo de documento)`**
(`UQ_cliente_archivo_cli_tdo` sobre `ca_cli_id, ca_tdo_id`), pensado para
reutilizarse entre solicitudes futuras en vez de volver a pedir el mismo
documento cada vez. Se implementó lo que este documento llamaba "diseño
pospuesto" — ver
`plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md` en esta
misma carpeta para el diseño completo.

Mecánica confirmada en `src/cliente-archivo/cliente-archivo.service.ts`:

- **`promoverDocumentos`**: al aprobar una solicitud en Comité de Crédito 2
  (dentro de la misma transacción que `guardarConceptoGenerico`,
  `solicitudes-workflow.service.ts`), cada documento activo de la solicitud
  (`sa_estado = 'activo'`, sin `sa_requiere_cambio`) se **duplica** en
  Cloudinary (`storageService.duplicate()`, método nuevo en
  `IStorageService` — no listado en la versión original de este documento)
  y el resultado se hace upsert en `Cliente_archivo`. Es una copia real del
  asset, no solo copiar la URL — a propósito, para que borrar/reemplazar el
  documento en la solicitud original no se lleve el archivo consolidado del
  cliente (gap encontrado y corregido el 2026-08-02, ver
  `migrations/20260802_agregar_cloudinary_ids_cliente_archivo.sql`).
- **`reutilizarEnSolicitud`**: al diligenciar una solicitud nueva
  (ej. ampliación de cupo), si el cliente ya tiene el documento vigente en
  `Cliente_archivo`, se duplica de vuelta hacia `Solicitud_archivo` en vez
  de pedírselo de nuevo — usado desde
  `solicitudes.controller.ts:1275`.
- **`tieneDocumentosVencidos`**: usado por `ampliacion-cupo.service.ts` para
  bloquear una ampliación si el cliente tiene documentos vencidos en su
  archivo maestro.
- Backfill al crear la tabla: pobló `Cliente_archivo` con los documentos de
  la última solicitud aprobada de cada cliente ya existente, para que
  `tieneDocumentosVencidos` no interprete "tabla vacía" como "todo vigente".
- Fix posterior (`migrations/20260809_cliente_archivo_solicitud_set_null.sql`):
  la FK hacia `Solicitud_archivo` (`ca_sa_id`, solo trazabilidad de origen)
  pasó a `ON DELETE SET NULL` — con `NO ACTION` (default), borrar una
  solicitud con algún documento ya promovido al archivo del cliente
  reventaba el `DELETE` en cascada.

Para ver **todos** los documentos de un cliente sigue sin existir un único
endpoint "todo lo del cliente X" que junte histórico de solicitudes +
archivo maestro — `Cliente_archivo` resuelve "cuál es el documento vigente
de tipo Y para reutilizar", no un repositorio completo de todo lo subido
alguna vez.

## Gotcha confirmado: documentos legacy con ruta rota

Verificado en vivo contra la base de datos (2026-07-13): de 61 filas en
`Solicitud_archivo`, **49 son anteriores a la migración a Cloudinary** y
tienen:
- `sa_cloudinary_public_id IS NULL`
- `sa_ruta_almacenamiento` con una ruta absoluta de disco de una máquina de
  desarrollo, ej.:
  `C:\Users\Dynabook\OneDrive\Documents\CARTONERA\PortalClientesCN\BACKEND\uploads\solicitudes\1133\...`

El endpoint de descarga (`solicitudes-documentos.service.ts::descargarArchivoRespuesta`,
y el análogo en `solicitudes-respuestas.service.ts`) hace:

```
downloadUrl = sa_cloudinary_public_id
  ? storageService.buildDownloadUrl(...)   // URL real de Cloudinary
  : sa_ruta_almacenamiento;                 // fallback: valor crudo de la columna
```

Para esas 49 filas legacy, el fallback devuelve tal cual esa ruta local de
Windows como `downloadUrl` — no es una URL utilizable por el navegador.
`main.ts` no tiene `express.static`/`useStaticAssets` sirviendo `/uploads`,
así que no hay ningún camino para que esa ruta resuelva a un archivo
descargable en producción (Render).

Los archivos físicos de esos 49 registros **sí siguen existiendo y están
versionados en git** (`BACKEND/uploads/solicitudes/{sol_id}/...`, 71
archivos trackeados, confirmado con `git ls-files uploads`), así que no se
perdieron — pero hoy son inalcanzables por la app porque la columna en BD
apunta a una ruta de disco que no existe en el servidor desplegado.

**Pendiente si se quiere corregir** (no implementado, solo diagnosticado):
subir esos 49 archivos desde `BACKEND/uploads/solicitudes/` a Cloudinary
reusando `CloudinaryStorageService.upload`, y actualizar
`sa_ruta_almacenamiento` + `sa_cloudinary_public_id` + `sa_resource_type`
en cada fila con el resultado.

**Corrección 2026-08-09 — sí existe un script para esto, pero tiene un bug
sin corregir**: `scripts/backfill-documentos-cloudinary.js` (commit
`3a92a0d`, 2026-07-12 — un día **después** de la migración de abajo) hace
justo lo pendiente: sube cada archivo con `sa_ruta_almacenamiento NOT LIKE
'http%'` a Cloudinary y actualiza `sa_ruta_almacenamiento` /
`sa_cloudinary_public_id` / `sa_resource_type` en `Solicitud_archivo`.

El bug: por cada fila, el script hace un **segundo** `UPDATE` contra una
tabla `Solicitud_documento` (para sincronizar `sd_ruta_archivo`) — pero esa
tabla fue renombrada a `Solicitud_documento_deprecated` un día antes, en
`migrations/20260711_merge_solicitud_documento_en_archivo.sql` (confirmado
que sigue así: `20260722_fk_cascade_tablas_hijas_solicitudes.sql` la
menciona explícitamente como "no la usa ningún código vigente"). El script
nunca se actualizó tras el merge, así que ese segundo `UPDATE` falla hoy con
"Invalid object name 'Solicitud_documento'".

Como los dos `UPDATE` de cada fila **no están en una transacción** (dos
`pool.request()` independientes), el primero — el que realmente importa,
sobre `Solicitud_archivo` — se confirma en la base igual, y el script
reporta esa fila como `❌ fallido` solo por el segundo `UPDATE` roto. En la
práctica, correrlo hoy probablemente sí arreglaría las 49 filas legacy,
pero el log de salida mentiría diciendo que todas fallaron.

No se encontró evidencia (logs, commits, o mención en otra documentación)
de que este script se haya ejecutado alguna vez contra producción — lo más
probable es que las 49 filas sigan rotas, pero no se reconfirmó el conteo
contra la base de datos en vivo.

## Por qué hay cinco tablas de archivos (y no una)

`Solicitud_archivo.sa_fp_id` es `NOT NULL` — toda fila exige una
`Formulario_pregunta` real detrás. Eso encaja con "documento que el cliente
sube contestando una pregunta del formulario", pero no con nada más. Cada
vez que apareció un archivo que no es eso, la solución fue crear una tabla
paralela en vez de forzarlo dentro de `Solicitud_archivo`:

| Tabla | Quién lo genera | Ligado a | Aparece en "Mis Documentos" |
|---|---|---|---|
| `Solicitud_archivo` (`sa_`) | Cliente, respondiendo una pregunta | `Formulario_pregunta` (`sa_fp_id`) | Sí (fuente principal) |
| `Solicitud_soporte_analisis` (`ssa_`) | Personal interno (hoy solo OFC) | Etapa del workflow (`ssa_wet_id`) | No — es de uso interno |
| `Solicitud_carta_vinculacion` (`scv_`) | El sistema, al aprobar en CC2 | Solo la solicitud (`scv_sol_id`) | Sí, vía `UNION ALL` |
| `Cliente_archivo` (`ca_`) | El sistema, al aprobar en CC2 (`promoverDocumentos`) | Cliente + tipo de documento (`ca_cli_id`, `ca_tdo_id`) | No — es el archivo maestro reutilizable, no un documento de una solicitud puntual |
| `Solicitud_evidencia_persona` (`sep_`) | Personal interno (Oficial de Cumplimiento) | Fila de una pregunta `TABLA` (`sep_fp_id` + `sep_fila_index`) | No confirmado — no se revisó si el `UNION ALL` la incluye |

Este patrón funciona pero no escala gratis: cada tabla nueva que deba
aparecer en "Mis Documentos" obliga a extender el `UNION ALL` de
`obtenerDocumentosConVigencia` (`solicitudes-documentos.service.ts`) con
`CAST(...)` columna por columna para que los tipos coincidan con
`Solicitud_archivo` — ver el caso real en
`plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md` (sección
"Persistir la Carta de Vinculación..."). `Cliente_archivo` (implementado
2026-08-02, ver sección de arriba) confirmó la excepción que ya se
anticipaba: por diseño no aparece en "Mis Documentos" de una solicitud
puntual (es "el documento vigente para reutilizar", no un documento subido
en esa solicitud), así que no necesitó sumarse al `UNION ALL` — pero sí
repitió el resto del patrón (tabla paralela con su propio prefijo,
`ca_cloudinary_public_id`/`ca_resource_type` duplicando la estructura de
`sa_`).

## Problemas y mejoras a evaluar (sin implementar todavía)

- **Resuelto 2026-08-09**: no había una función central para armar la
  carpeta de Cloudinary — cada punto de subida repetía su propio
  `SELECT cop_nombre FROM Centro_operacion WHERE cop_id = @0` + el mismo
  template string armado a mano (esto ya había causado un descuido real: al
  implementar la carta, el `SELECT` de `enviarCartaVinculacionPorCorreo` no
  traía `cop_nombre` y hubo que agregarlo aparte). Se centralizó **el
  prefijo base** (`documentos-solicitudes/` / `pqrs/`) en
  `CarpetaAlmacenamientoService`, leyéndolo desde la tabla `Urls` (ver
  sección de arriba), y más tarde el mismo día se quitó por completo el
  `{centro}` de la ecuación (ver
  `centro-operacion-vestigial-en-solicitudes.md`) y se conectaron los dos
  puntos que aún tenían el prefijo escrito a mano
  (`cliente-archivo.service.ts`, `ampliacion-cupo.service.ts`). El "resto"
  que arma cada servicio quedó reducido a `{subcarpeta}/{numero}` — ya no
  hay ningún `SELECT cop_nombre` disperso por el código. No verificado si
  `enviarCartaVinculacionPorCorreo` (la carta de vinculación) también se
  actualizó — no se tocó en la sesión del 2026-08-09.
- **El estado/soft-delete no es consistente entre tablas.**
  `Solicitud_archivo` usa `sa_estado` (`'activo'`/`'inactivo'`),
  `Solicitud_soporte_analisis` usa `ssa_estado` con el mismo mecanismo, pero
  `Solicitud_carta_vinculacion` **no tiene columna de estado** — no hay
  forma de "eliminar" o desactivar una carta ya generada sin borrar la fila
  entera. No es un problema hoy (nada la borra), pero es una inconsistencia
  a tener presente si en el futuro se agrega esa funcionalidad.
- **El `UNION ALL` de "Mis Documentos" es manual y frágil.** Cada columna
  nueva en `Tipos_documentos`/`Solicitud_archivo` que el frontend empiece a
  consumir (como ya pasó con `tdo_tipo_plantilla`, ver `CLAUDE.md`) obliga a
  revisar si el `UNION ALL` sigue teniendo el mismo número de columnas en el
  mismo orden con tipos compatibles — no hay ningún test ni chequeo
  automático de eso, solo la disciplina de acordarse. Mejora a evaluar (sin
  decidir): mover ese ensamblado a la aplicación (tres queries simples +
  merge en TypeScript) en vez de un único `UNION ALL` en SQL crudo, a costa
  de tres round-trips en vez de uno.
- **La proliferación de tablas casi-idénticas** (`sa_`/`ssa_`/`scv_`/`ca_`,
  esta última ya implementada 2026-08-02) es la consecuencia directa de que
  `Solicitud_archivo` no admite `fp_id NULL`. Vale la pena evaluar, como
  cambio de fondo (no decidido, no para esta iteración), si conviene
  relajar esa restricción y agregar una columna `sa_origen`
  (`CLIENTE`/`INTERNO`/`SISTEMA`) en vez de seguir creando una tabla nueva
  cada vez que aparece un archivo que no encaja en el modelo original —
  pero esto implicaría migrar `Solicitud_soporte_analisis` y
  `Solicitud_carta_vinculacion` hacia `Solicitud_archivo`, no es un cambio
  chico. `Cliente_archivo` es un caso algo distinto de los otros dos: por
  diseño necesita ser un documento propio y duplicado (no una fila que
  apunte al mismo asset), así que ni siquiera colapsaría limpiamente en
  `Solicitud_archivo` con solo agregar `sa_origen`.
