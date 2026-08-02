-- Backfill: tdo_encabezado_tipo quedó en 'NINGUNO' (el DEFAULT de la
-- migración 20260727_unificar_carta_vinculacion_en_tipos_documentos.sql)
-- para todo Tipos_documentos existente, pero el comportamiento visual real
-- de los documentos origen='CLIENTE' con tipo_plantilla='TEXTO' hasta hoy
-- es "encabezado de formato oficial (tabla logo/código/página/revisión)
-- siempre" — carta-pdf.util.ts (frontend, pdf-lib) dibuja esa tabla sin
-- condicionarla a tdo_encabezado_tipo, que hasta ahora esa columna era
-- ignorada para este origen. A partir de que el frontend empiece a honrar
-- la columna (selector "Tipo de encabezado" para CLIENTE+TEXTO), sin este
-- backfill todo documento existente perdería su encabezado de golpe.
-- Idempotente: el filtro tdo_encabezado_tipo='NINGUNO' evita pisar una
-- elección explícita posterior (ej. alguien que ya eligió 'NINGUNO' a
-- propósito después de este despliegue).

UPDATE dbo.Tipos_documentos
SET tdo_encabezado_tipo = 'FORMATO_OFICIAL'
WHERE tdo_origen = 'CLIENTE'
  AND tdo_tipo_plantilla = 'TEXTO'
  AND tdo_encabezado_tipo = 'NINGUNO';
