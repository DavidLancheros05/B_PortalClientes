-- Migración: Límite de filas para pregunta tipo TABLA
-- Fecha: 2026-07-10
-- Descripción: Permite definir un límite de filas para preguntas tipo TABLA:
--              sin límite, un número fijo (reutiliza fp_maximo) o condicional
--              según la respuesta de otra pregunta del formulario.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_tabla_limite_modo'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_tabla_limite_modo VARCHAR(20) NULL;
    PRINT 'Columna fp_tabla_limite_modo agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_tabla_limite_modo ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_tabla_limite_pregunta_id'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_tabla_limite_pregunta_id INT NULL;
    PRINT 'Columna fp_tabla_limite_pregunta_id agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_tabla_limite_pregunta_id ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_tabla_limite_reglas'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_tabla_limite_reglas NVARCHAR(MAX) NULL;
    PRINT 'Columna fp_tabla_limite_reglas agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_tabla_limite_reglas ya existe';
END;

-- Verificación
SELECT
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Formulario_pregunta'
  AND COLUMN_NAME IN (
      'fp_tabla_limite_modo',
      'fp_tabla_limite_pregunta_id',
      'fp_tabla_limite_reglas'
  );
