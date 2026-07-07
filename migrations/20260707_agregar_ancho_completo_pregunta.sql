-- Migración: Permitir que una pregunta ocupe el ancho completo de la fila
-- Fecha: 2026-07-07
-- Descripción: Agrega fp_ancho_completo (bit) a Formulario_pregunta. Cuando está
--              activo, la pregunta se muestra ocupando toda la fila en el
--              formulario de solicitud, en vez de compartir espacio con otras
--              preguntas (útil para preguntas tipo tabla con varias columnas).

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_ancho_completo'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_ancho_completo BIT NOT NULL DEFAULT 0;
    PRINT 'Columna fp_ancho_completo agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_ancho_completo ya existe';
END;

-- Verificación
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_ancho_completo';
