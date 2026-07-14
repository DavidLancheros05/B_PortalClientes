# Almacenamiento de archivos — dónde quedan y estado actual (2026-07-13)

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
  `documentos-solicitudes/{centro_operación}/formularios/{numero_solicitud}/`
- Soportes de análisis subidos por personal interno (Oficial de
  Cumplimiento, etc.), no ligados a ninguna pregunta del formulario
  (tabla `Solicitud_soporte_analisis`, `solicitudes-documentos.service.ts::subirSoporteAnalisis`):
  `documentos-solicitudes/{centro_operación}/soportes/{numero_solicitud}/`
- Carta de Vinculación Comercial, generada por el sistema (no subida por
  nadie) al aprobarse la solicitud en Comité de Crédito 2 (tabla
  `Solicitud_carta_vinculacion`, `solicitudes-workflow.service.ts::enviarCartaVinculacionPorCorreo`,
  agregado 2026-07-13):
  `documentos-solicitudes/{centro_operación}/cartas/{numero_solicitud}/`

Los tres casos usan `resource_type: 'raw'` para todo lo que no sea imagen
(los PDF se fuerzan a `raw` porque Cloudinary los clasifica por defecto
como `image` bajo `auto`, y las cuentas nuevas bloquean servir PDF/ZIP como
`image` con 401).

## No existe una "carpeta del cliente"

La organización es siempre por **centro de operación + número de
solicitud**, nunca por `cliente_id`. No hay un repositorio único de
"archivos del cliente X" en Cloudinary ni en la base de datos: para ver
todos los documentos de un cliente hay que consultar todas sus solicitudes
(`solicitudes.sol_cliente_id`) y de ahí sus filas en `Solicitud_archivo`.
Esto coincide con que la idea de un "archivo maestro de documentos del
cliente" (ver `plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md`
en esta misma carpeta) quedó como diseño pospuesto, no implementado.

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

## Por qué hay tres tablas de archivos (y no una)

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

Este patrón funciona pero no escala gratis: cada tabla nueva que deba
aparecer en "Mis Documentos" obliga a extender el `UNION ALL` de
`obtenerDocumentosConVigencia` (`solicitudes-documentos.service.ts`) con
`CAST(...)` columna por columna para que los tipos coincidan con
`Solicitud_archivo` — ver el caso real en
`plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md` (sección
"Persistir la Carta de Vinculación..."). Cuando se implemente
`Cliente_archivo` (documentos reutilizables entre solicitudes, ver más
arriba) sumará una cuarta tabla — por diseño esa no debería aparecer en
"Mis Documentos" de una solicitud puntual, así que no necesita el mismo
`UNION ALL`, pero sí repetirá el resto del patrón.

## Problemas y mejoras a evaluar (sin implementar todavía)

- **No hay una función central para armar la carpeta de Cloudinary.** Los
  tres puntos de subida (`guardarRespuestaArchivo`, `subirSoporteAnalisis`,
  `enviarCartaVinculacionPorCorreo`) repiten cada uno su propio
  `SELECT cop_nombre FROM Centro_operacion WHERE cop_id = @0` + el mismo
  template string `documentos-solicitudes/{centro}/{subcarpeta}/{numero}`
  armado a mano. Ya causó un descuido real hoy: al implementar la carta, el
  `SELECT` de `enviarCartaVinculacionPorCorreo` no traía `cop_nombre` y
  hubo que agregarlo aparte — con una función compartida ese tipo de olvido
  no pasaría. Mejora sugerida: extraer un helper (p. ej.
  `construirCarpetaAlmacenamiento(centro, subcarpeta, numeroSolicitud)` en
  algún sitio común) que los tres servicios llamen en vez de reconstruir el
  string cada uno por su lado.
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
- **La proliferación de tablas casi-idénticas** (`sa_`/`ssa_`/`scv_`, y
  pronto `ca_`) es la consecuencia directa de que `Solicitud_archivo` no
  admite `fp_id NULL`. Vale la pena evaluar, como cambio de fondo (no
  decidido, no para esta iteración), si conviene relajar esa restricción y
  agregar una columna `sa_origen` (`CLIENTE`/`INTERNO`/`SISTEMA`) en vez de
  seguir creando una tabla nueva cada vez que aparece un archivo que no
  encaja en el modelo original — pero esto implicaría migrar
  `Solicitud_soporte_analisis` y `Solicitud_carta_vinculacion` hacia
  `Solicitud_archivo`, no es un cambio chico.
