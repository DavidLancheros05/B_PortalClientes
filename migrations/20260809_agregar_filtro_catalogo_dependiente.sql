-- Migración: Filtro dinámico de catálogo para preguntas SELECT_TABLA
-- Fecha: 2026-08-09
-- Descripción: Permite que una pregunta tipo SELECT_TABLA filtre las filas
--              de su catálogo externo según la respuesta en vivo de otra
--              pregunta del formulario (ej. "Condición de Pago" solo debe
--              mostrar condiciones de crédito cuando "¿Solicitud de
--              Crédito?" = Si). Mecanismo genérico e independiente de
--              fp_pregunta_padre_id/fp_valor_padre_disparador (que solo
--              controlan mostrar/ocultar la pregunta completa).

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_filtro_columna'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_catalogo_filtro_columna VARCHAR(100) NULL;
    PRINT 'Columna fp_catalogo_filtro_columna agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_catalogo_filtro_columna ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_filtro_pregunta_id'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_catalogo_filtro_pregunta_id INT NULL;
    PRINT 'Columna fp_catalogo_filtro_pregunta_id agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_catalogo_filtro_pregunta_id ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_filtro_reglas'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_catalogo_filtro_reglas NVARCHAR(MAX) NULL;
    PRINT 'Columna fp_catalogo_filtro_reglas agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna fp_catalogo_filtro_reglas ya existe';
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
      'fp_catalogo_filtro_columna',
      'fp_catalogo_filtro_pregunta_id',
      'fp_catalogo_filtro_reglas'
  );
