-- Fusiona la Carta de Vinculación (antes tabla aparte param_carta_pdf_vinculacion,
-- con su propia pantalla en /parametrizacion/carta-pdf-vinculacion) dentro de
-- Tipos_documentos, para que use el mismo editor (PlantillaEditor: negrilla,
-- tamaño, viñeta) que ya usan los documentos de tipo TEXTO que sube el
-- cliente. tdo_origen distingue "el cliente lo sube durante el formulario"
-- de "el sistema lo genera solo al aprobar" — este segundo grupo no tiene
-- Formulario_pregunta asociada ni tiene sentido en el flujo del cliente.
--
-- Encabezado: en vez de portar la tabla de "formato oficial" (logo/código de
-- FORMATO/página/revisión, que en el frontend usa un motor de dibujo
-- distinto — pdf-lib, ~1200 líneas, solo existe ahí) se agrega una opción de
-- encabezado más simple: una imagen que el usuario sube y que se dibuja tal
-- cual arriba de cada página del PDF generado por el backend (pdfkit).
-- tdo_encabezado_tipo = 'FORMATO_OFICIAL' queda reservado para más adelante
-- si se decide portar el motor completo — hoy el backend solo sabe dibujar
-- 'NINGUNO' e 'IMAGEN'.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Tipos_documentos') AND name = 'tdo_origen'
)
BEGIN
  ALTER TABLE dbo.Tipos_documentos
    ADD tdo_origen VARCHAR(20) NOT NULL DEFAULT 'CLIENTE';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Tipos_documentos') AND name = 'tdo_encabezado_tipo'
)
BEGIN
  ALTER TABLE dbo.Tipos_documentos
    ADD tdo_encabezado_tipo VARCHAR(20) NOT NULL DEFAULT 'NINGUNO';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Tipos_documentos') AND name = 'tdo_encabezado_imagen_url'
)
BEGIN
  ALTER TABLE dbo.Tipos_documentos
    ADD tdo_encabezado_imagen_url NVARCHAR(500) NULL;
END

-- Migrar filas existentes de param_carta_pdf_vinculacion, si la tabla existe
-- y no se migraron todavía (idempotente: no duplica si ya hay filas con
-- tdo_origen='CARTA_APROBACION' y el mismo nombre). Va en EXEC() dinámico
-- porque referencia columnas agregadas arriba en este mismo script — SQL
-- Server resuelve nombres de columna al compilar el batch completo, no en
-- el orden en que corren los IF, así que sin esto falla con "Invalid column
-- name" aunque el ALTER TABLE ya haya corrido antes en el mismo batch.
IF OBJECT_ID('dbo.param_carta_pdf_vinculacion', 'U') IS NOT NULL
BEGIN
  EXEC(N'
    INSERT INTO dbo.Tipos_documentos
      (tdo_nombre, tdo_descripcion, tdo_obligatorio, tdo_tiene_plantilla,
       tdo_plantilla_contenido, tdo_tipo_plantilla, tdo_permite_vencimiento,
       tdo_aplica_cliente, tdo_estado, tdo_origen, tdo_encabezado_tipo)
    SELECT
      cpv.cpv_nombre,
      ''Migrado desde param_carta_pdf_vinculacion el 2026-07-27'',
      0,
      1,
      cpv.cpv_contenido,
      ''TEXTO'',
      0,
      0,
      cpv.cpv_activo,
      ''CARTA_APROBACION'',
      ''NINGUNO''
    FROM dbo.param_carta_pdf_vinculacion cpv
    WHERE NOT EXISTS (
      SELECT 1 FROM dbo.Tipos_documentos td
      WHERE td.tdo_origen = ''CARTA_APROBACION''
        AND td.tdo_nombre = cpv.cpv_nombre COLLATE DATABASE_DEFAULT
    );
  ');

  -- Antes de migrar había 2 filas activas a la vez en param_carta_pdf_vinculacion
  -- (cpv_id 1 "Carta de Vinculación Comercial 2024" y cpv_id 2 "Confirmación
  -- de Crédito - Formato Corto") — el backend elegía cuál usar con
  -- `SELECT TOP 1 ... WHERE cpv_activo = 1` sin ORDER BY, es decir, de forma
  -- no determinista. Se deja activa únicamente "Carta de Vinculación
  -- Comercial 2024" (la que se estaba editando en vivo al momento de esta
  -- migración) y se inactiva la otra — revisar y corregir a mano si no era
  -- la intención.
  EXEC(N'
    UPDATE dbo.Tipos_documentos
    SET tdo_estado = 0
    WHERE tdo_origen = ''CARTA_APROBACION''
      AND tdo_nombre <> ''Carta de Vinculación Comercial 2024'';
  ');
END
