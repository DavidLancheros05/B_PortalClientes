# Unificación de la Carta de Vinculación con Tipos de documentos + "Generar plantilla"

Hecho el 2026-07-27/28. Vive solo en local (backend y frontend), falta
commit/push en ambos repos. Continúa el hilo de
[`rediseno-gestionar-comite-credito.md`](rediseno-gestionar-comite-credito.md)
(mismo día, misma sesión) — ese cubre el rediseño visual de CC1/CC2/OC; este
cubre lo que salió después al revisar el sistema de documentos en general.

## El problema de origen

Al agregar un tipo de documento nuevo "Carta de Vinculación Comercial" desde
`Parametrización → Documentos` se descubrió que el sistema tenía **tres
cosas distintas llamadas "Carta de Vinculación"**, sin relación entre sí:

1. **La real** — se genera con `pdfkit` y se envía por correo automáticamente
   cuando el Comité de Crédito 2 aprueba una solicitud
   (`solicitudes-workflow.service.ts::enviarCartaVinculacionPorCorreo`),
   configurada en una tabla aparte `param_carta_pdf_vinculacion` con su
   propia pantalla (`parametrizacion/carta-pdf-vinculacion`).
2. **Tipos de documentos** (`Tipos_documentos` + `Formulario_pregunta`) — para
   documentos que el cliente sube o descarga/firma/vuelve a subir **durante**
   el formulario de su solicitud, antes de que exista aprobación, cupo o
   condiciones financieras.
3. El tipo de documento nuevo que se había creado ahí por error, sin relación
   con ninguna de las dos anteriores (se desactivó, `tdo_id=27` →
   reutilizado después para otra cosa, ver más abajo).

Además se encontró un bug real e independiente: `enviarCartaVinculacionPorCorreo`
elegía la plantilla con `SELECT TOP 1 ... WHERE cpv_activo = 1` **sin
`ORDER BY`**, y en la práctica había **2 filas activas a la vez** — cuál se
enviaba de verdad por correo era no determinista.

## Decisión: fusionar, no duplicar

En vez de mantener dos pantallas con features parcialmente duplicadas (se
intentó primero replicar negrilla/tamaño en la pantalla vieja de
`carta-pdf-vinculacion`, pero le faltaba encabezado oficial e historial de
revisiones — iba a haber que sincronizar cada feature nueva entre dos
lugares para siempre), se decidió que **la Carta de Vinculación pase a ser
una fila más de `Tipos_documentos`**, distinguida por un campo `tdo_origen`.

### Encabezado: alcance recortado a propósito

El encabezado "formato oficial" (tabla logo/código de FORMATO/página/
revisión) que ya usan otros documentos con plantilla **no se portó** — esa
tabla se dibuja con `pdf-lib` en el frontend
(`FRONTEND/src/lib/carta-pdf.util.ts`, ~1200 líneas,
`dibujarEncabezadoOficialPdf`/`dibujarTablaRevisionesPdf`), mientras que el
backend genera con `pdfkit` — portar ese motor de dibujo por coordenadas
completo, a mano, entre dos repos que no comparten código, para el
documento con más impacto legal/comercial del sistema, se consideró
demasiado riesgo para una sola sesión. En su lugar se agregó una opción de
encabezado más simple y de bajo riesgo: **una imagen que el usuario sube**,
dibujada tal cual arriba de cada página. `tdo_encabezado_tipo` queda con un
tercer valor `'FORMATO_OFICIAL'` reservado en el enum, sin implementar en
el backend, por si se retoma más adelante.

## Cambios de esquema (BD)

Migración `20260727_unificar_carta_vinculacion_en_tipos_documentos.sql`:

- `Tipos_documentos` gana 3 columnas:
  - `tdo_origen` VARCHAR(20) DEFAULT `'CLIENTE'` — `'CLIENTE'` (default, como
    hasta ahora) o `'CARTA_APROBACION'` (el sistema lo genera y envía solo).
  - `tdo_encabezado_tipo` VARCHAR(20) DEFAULT `'NINGUNO'` — `'NINGUNO'`,
    `'IMAGEN'`, o `'FORMATO_OFICIAL'` (reservado, sin implementar).
  - `tdo_encabezado_imagen_url` NVARCHAR(500) NULL.
- Migra los datos de `param_carta_pdf_vinculacion` (2 filas: "Carta de
  Vinculación Comercial 2024" y "Confirmación de Crédito - Formato Corto")
  como filas nuevas de `Tipos_documentos` con `tdo_origen='CARTA_APROBACION'`.
  **Deja activa solo una** (la primera, que era la que se estaba editando en
  vivo en ese momento) — revisar si no era la intención.
- Nota técnica: el `INSERT`/`UPDATE` que referencian las columnas nuevas van
  envueltos en `EXEC(N'...')` — sin eso, SQL Server falla con
  "Invalid column name" porque resuelve nombres de columna al compilar el
  batch completo, no en el orden en que corren los `IF`. También hizo falta
  `COLLATE DATABASE_DEFAULT` en la comparación `cpv_nombre = tdo_nombre`
  (colisión de collations entre las dos tablas).

`param_carta_pdf_vinculacion` (tabla vieja) **no se borró** — queda sin uso,
por si hace falta revisar el histórico.

## Backend

- **`TipoDocumento` entity**: campos `origen`, `encabezadoTipo`,
  `encabezadoImagenUrl` nuevos.
- **`TiposDocumentosService`**: al guardar (crear o actualizar) un
  documento con `origen='CARTA_APROBACION'` y `estado=true`, **desactiva
  automáticamente cualquier otro del mismo origen** — mismo criterio que un
  radio button, arregla de raíz el bug de "2 activas a la vez" (ya no hace
  falta acordarse de desactivar la otra a mano).
- **Endpoint nuevo** `POST /parametrizacion/tipos-documentos/:id/encabezado-imagen`
  (multipart, `FileInterceptor`) — sube la imagen vía `StorageService` (el
  mismo de siempre, Cloudinary) y setea `encabezadoTipo='IMAGEN'` +
  `encabezadoImagenUrl` en un solo paso.
- **`enviarCartaVinculacionPorCorreo`** (en
  `solicitudes-workflow.service.ts`) ya no lee `param_carta_pdf_vinculacion`
  — lee `Tipos_documentos WHERE tdo_origen='CARTA_APROBACION' AND
  tdo_estado=1`.
- **`generarPDFCarta`** (mismo archivo, `pdfkit`):
  - Nuevo parámetro `encabezadoImagenUrl`. Si viene, descarga la imagen
    (`fetch`, Node 18+ trae `fetch` global) y la dibuja con
    `doc.image(buffer, x, y, { fit: [495, 80], align: 'center' })` en una
    caja de alto fijo (80pt) — así el layout es predecible sin importar la
    proporción real de la imagen subida. Se repite en cada página nueva
    (`doc.on('pageAdded', ...)`), para cartas de más de una página. Si la
    descarga falla, cae de vuelta al membrete de texto de siempre (no rompe
    el envío del correo).
  - De paso (ver sesión anterior el mismo día,
    [`rediseno-gestionar-comite-credito.md`](rediseno-gestionar-comite-credito.md)):
    ya interpretaba los marcadores `**negrita**`/`{{size:N}}...{{/size}}`
    que guarda `PlantillaEditor.tsx` — eso sigue funcionando igual, ahora
    sobre contenido que vive en `Tipos_documentos` en vez de
    `param_carta_pdf_vinculacion`.

## Frontend

- **`DocumentosForm.tsx`** (el editor de Tipos de documentos, usado para
  crear/editar cualquier tipo): nuevo selector "Origen del documento" al
  principio del formulario. Al elegir `CARTA_APROBACION`:
  - Se fuerza `tienePlantilla=true`, `tipoPlantilla='TEXTO'` (no hay
    Formulario_pregunta que resolver, así que `PDF_SOLICITUD` no aplica).
  - Se ocultan: "Aplica fecha de emisión", el selector "Tipo de generación",
    el bloque "Encabezado de formato oficial" (código FORMATO/revisión/
    páginas totales) y "Control de cambios" (historial de revisiones) — 
    ninguno de los tres tiene efecto real en el PDF que genera el backend
    para este origen todavía.
  - Aparece en su lugar "Tipo de encabezado" (Ninguno / Imagen propia), con
    subida de imagen (requiere guardar el documento primero, mismo patrón
    que ya usaba "Control de cambios" con "guardá primero para poder
    agregar revisiones").
  - El panel "Insertar variable" cambia: en vez del selector de
    Sección/Pregunta del formulario del cliente, muestra botones fijos para
    las 5 variables de la carta (`{{cupo_aprobado}}`, `{{forma_pago}}`,
    `{{plazo}}`, `{{fecha_aprobacion}}`, `{{tasa_interes}}` — agregadas a
    `VARIABLES_CARTA_VINCULACION` en `plantilla-variables.util.ts`, junto a
    las 5 `VARIABLES_FIJAS` que ya existían).
- **`carta-pdf-vinculacion/page.tsx`**: ya no es la pantalla de gestión —
  ahora es un simple `redirect` a `/parametrizacion/documentos` (se dejó la
  ruta en vez de borrarla por si algún acceso directo viejo sigue apuntando
  ahí). El servicio viejo (`carta-pdf-vinculacion.service.ts`) se borró —
  nada más lo usaba.
- **`solicitudes/[id]/detalle/page.tsx`** (botón "Ver Carta PDF", genera una
  vista previa client-side con `html2pdf`/`carta-pdf.util.ts`): apuntaba al
  servicio viejo — si no se corregía, habría quedado mostrando contenido
  desactualizado para siempre después de esta migración, porque las
  ediciones ahora se hacen en `Tipos_documentos`, no en la tabla vieja. Ya
  lee de `documentosService.getAll()` filtrando `origen==='CARTA_APROBACION'
  && estado`.

## Feature nueva: "Generar plantilla" (vista previa con datos reales)

A pedido explícito, en `DocumentosForm.tsx` (para documentos con
`origen='CLIENTE'` y plantilla de texto ya guardados) se agregó un botón
**"Generar plantilla"** junto a Negrita/Tamaño/Viñeta, que abre
`GenerarPlantillaModal.tsx`:

1. Buscador de **Cliente** (`clientesService.getAll()` — sí, trae los ~1670
   clientes reales; el buscador filtra client-side).
2. Al elegir cliente, se cargan sus **solicitudes** (`solicitudesService.
   getAllByCliente`) en un segundo buscador.
3. "Generar PDF" arma el documento reutilizando **`generarPlantillaDocumentoPdf`**
   (la misma función que ya usa el cliente real al hacer clic en "Descargar
   plantilla" dentro de su formulario, en `DocumentoTablaField.tsx`) — no se
   escribió un generador nuevo. Para eso:
   - `solicitudesService.getFormularioRenderizable(solicitudId)` +
     `construirMapaRespuestasPregunta(...)` arman las variables
     `{{pregunta|...}}`.
   - El representante legal se deriva de la pregunta tipo TABLA con
     `fp_codigo='REP_LEGAL_TABLA'` (primera fila), mismo criterio que usa
     `SolicitudFormContent.tsx` para lo mismo.
   - `documentosService.getRevisiones(tipoDocumentoId)` trae el historial
     para la tabla "Control de cambios".
   - El contenido de la plantilla que se usa es el que está **en el
     formulario ahora mismo** (`plantillaContenidoWatch`, no lo que hay
     guardado en BD) — permite previsualizar cambios sin necesidad de
     guardar primero.

Esto es una herramienta de administrador para validar el diseño/las
variables de una plantilla contra datos reales, sin tener que llenar un
formulario de solicitud completo a mano. Solo aparece para
`origen='CLIENTE'` — para `CARTA_APROBACION` no tendría sentido tal cual
está (`generarPlantillaDocumentoPdf` no resuelve `{{cupo_aprobado}}`/
`{{forma_pago}}`/`{{plazo}}`, esas solo se resuelven en el flujo real de
`enviarCartaVinculacionPorCorreo`).

## Pendiente / limitaciones conocidas

- **Encabezado "Formato oficial" para `CARTA_APROBACION`**: no implementado
  en el backend (`pdfkit`). Si se necesita, hay que portar
  `dibujarEncabezadoOficialPdf`/`dibujarTablaRevisionesPdf` de
  `carta-pdf.util.ts` (pdf-lib) — trabajo grande, se evitó a propósito esta
  sesión (ver sección de decisión arriba).
- **"Control de cambios" para `CARTA_APROBACION`**: oculto en el formulario
  porque no se dibuja en el PDF real todavía (mismo motivo que el punto
  anterior).
- **"Generar plantilla" no sirve para `CARTA_APROBACION`** por la razón
  explicada arriba — si se necesita una vista previa de esa carta con datos
  reales, habría que extender el modal para resolver las 5 variables de
  condiciones financieras además de las de pregunta.
- **Vista previa de la lista de plantillas de correo** (`parametrizacion/
  carta-pdf-vinculacion`... ya no aplica, esa pantalla se eliminó) — no
  relevante, mencionado solo por si se buscaba.
- Como con el resto de cambios de esta sesión: nada de esto se desplegó,
  falta commit/push en `B_PortalClientes` y `F_PortalClientes`.
