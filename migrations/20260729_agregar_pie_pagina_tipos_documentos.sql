-- Agrega el pie de página configurable por documento para
-- Tipos_documentos con tdo_origen='CLIENTE' y tdo_tipo_plantilla='TEXTO'
-- (motor pdf-lib, F_PortalClientes/src/lib/carta-pdf.util.ts) — mismo
-- patrón que tdo_encabezado_tipo/tdo_encabezado_imagen_url agregados en
-- 20260727_unificar_carta_vinculacion_en_tipos_documentos.sql, pero para
-- la banda inferior de cada página en vez de la superior.
--
-- A diferencia del encabezado, no hace falta backfill: el default
-- 'NINGUNO' es correcto para todo documento existente — el pie por
-- página es una funcionalidad nueva, no reemplaza ningún comportamiento
-- visual que ya existiera con ese alcance (el "cierre" de una sola vez al
-- final del documento, con texto fijo y tabla de revisiones, sigue igual
-- y es independiente de esta columna).

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Tipos_documentos') AND name = 'tdo_pie_pagina_tipo'
)
BEGIN
  ALTER TABLE dbo.Tipos_documentos
    ADD tdo_pie_pagina_tipo VARCHAR(20) NOT NULL DEFAULT 'NINGUNO';
END

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Tipos_documentos') AND name = 'tdo_pie_pagina_texto'
)
BEGIN
  ALTER TABLE dbo.Tipos_documentos
    ADD tdo_pie_pagina_texto NVARCHAR(300) NULL;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.Tipos_documentos') AND name = 'tdo_pie_pagina_imagen_url'
)
BEGIN
  ALTER TABLE dbo.Tipos_documentos
    ADD tdo_pie_pagina_imagen_url NVARCHAR(500) NULL;
END
