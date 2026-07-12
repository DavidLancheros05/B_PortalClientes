-- Migración: Flag "requiere cambio" en documentos de solicitud
-- Fecha: 2026-07-15
-- Descripción: Cuando el Auxiliar de Servicio al Cliente rechaza una
--              solicitud marcando en el checklist "Documentos con Fecha de
--              Emisión Incorrecta" cuáles tipos de documento tienen la
--              fecha mal puesta, se persiste esa marca por documento para
--              que /solicitudes/mis-documentos solo permita editar esos
--              documentos (además de los que estén vencidos). Al
--              reemplazar el archivo (DELETE + INSERT en
--              Solicitud_documento) el flag vuelve a 0 automáticamente por
--              el DEFAULT, sin tocar código.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Solicitud_documento' AND COLUMN_NAME = 'sd_requiere_cambio'
)
BEGIN
    ALTER TABLE Solicitud_documento
    ADD sd_requiere_cambio BIT NOT NULL DEFAULT 0;
    PRINT 'Columna sd_requiere_cambio agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sd_requiere_cambio ya existe';
END;

-- Verificación
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Solicitud_documento'
  AND COLUMN_NAME = 'sd_requiere_cambio';
