-- Migración: Soporte para pregunta tipo TABLA (columnas dinámicas)
-- Fecha: 2026-07-07
-- Descripción: Agrega fp_tabla_columnas (JSON con nombres de columnas) a Formulario_pregunta
--              y amplía fr_valor_texto a NVARCHAR(MAX) para poder guardar las filas
--              de una pregunta TABLA como JSON en Formulario_respuesta.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_tabla_columnas'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_tabla_columnas NVARCHAR(MAX) NULL;
    PRINT 'Columna fp_tabla_columnas agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_tabla_columnas ya existe';
END;

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_respuesta' AND COLUMN_NAME = 'fr_valor_texto'
      AND (CHARACTER_MAXIMUM_LENGTH <> -1 OR CHARACTER_MAXIMUM_LENGTH IS NULL)
)
BEGIN
    ALTER TABLE Formulario_respuesta
    ALTER COLUMN fr_valor_texto NVARCHAR(MAX) NULL;
    PRINT 'Columna fr_valor_texto ampliada a NVARCHAR(MAX)';
END
ELSE
BEGIN
    PRINT 'Columna fr_valor_texto ya es NVARCHAR(MAX)';
END;

-- Verificación
SELECT
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_tabla_columnas')
   OR (TABLE_NAME = 'Formulario_respuesta' AND COLUMN_NAME = 'fr_valor_texto');
