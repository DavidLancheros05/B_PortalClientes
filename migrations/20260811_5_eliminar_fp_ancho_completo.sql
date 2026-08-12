-- Elimina fp_ancho_completo, reemplazada por fp_ancho_columnas (1/2/3) en
-- 20260811_4. Solo correr después de que el backend/frontend ya no la
-- referencien (verificado: ver 20260811_4).

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_ancho_completo'
)
BEGIN
    DECLARE @constraintName NVARCHAR(200);
    SELECT @constraintName = dc.name
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('Formulario_pregunta') AND c.name = 'fp_ancho_completo';

    IF @constraintName IS NOT NULL
    BEGIN
        EXEC('ALTER TABLE Formulario_pregunta DROP CONSTRAINT ' + @constraintName);
    END

    ALTER TABLE Formulario_pregunta DROP COLUMN fp_ancho_completo;
END
