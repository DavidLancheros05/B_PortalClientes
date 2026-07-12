-- Distingue CÓMO se genera el PDF descargable de un tipo de documento con
-- plantilla: 'TEXTO' (sustituye {{placeholders}} en tdo_plantilla_contenido,
-- comportamiento original) o 'PDF_SOLICITUD' (descarga el PDF completo ya
-- generado de la solicitud vía GET /solicitudes/:id/pdf, para documentos que
-- en realidad SON el formulario diligenciado, como F-P3-06).

IF COL_LENGTH('Tipos_documentos', 'tdo_tipo_plantilla') IS NULL
  ALTER TABLE Tipos_documentos ADD tdo_tipo_plantilla VARCHAR(20) NOT NULL CONSTRAINT DF_tdo_tipo_plantilla DEFAULT 'TEXTO';
