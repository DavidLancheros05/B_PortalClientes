-- Migración: Plantilla descargable por tipo de documento
-- Fecha: 2026-07-14
-- Descripción: Algunos documentos no son un archivo que el cliente ya
--              tiene (ej. "Manifestacion suscrita F-P3-07") — son una
--              declaración que debe generarse, firmarse y volver a subir.
--              Se agrega la posibilidad de asociar una plantilla de texto
--              (con placeholders) a cualquier tipo de documento, para que
--              el cliente la descargue ya rellena con datos reales de su
--              solicitud antes de firmarla y subirla.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Tipos_documentos' AND COLUMN_NAME = 'tdo_tiene_plantilla'
)
BEGIN
    ALTER TABLE Tipos_documentos
    ADD tdo_tiene_plantilla BIT NOT NULL DEFAULT 0;
    PRINT 'Columna tdo_tiene_plantilla agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna tdo_tiene_plantilla ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Tipos_documentos' AND COLUMN_NAME = 'tdo_plantilla_contenido'
)
BEGIN
    ALTER TABLE Tipos_documentos
    ADD tdo_plantilla_contenido NVARCHAR(MAX) NULL;
    PRINT 'Columna tdo_plantilla_contenido agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna tdo_plantilla_contenido ya existe';
END;

-- Verificación
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Tipos_documentos'
  AND COLUMN_NAME IN ('tdo_tiene_plantilla', 'tdo_plantilla_contenido');
