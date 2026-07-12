-- Migración: Default faltante en Tipos_documentos.tdo_created_at
-- Fecha: 2026-07-11
-- Descripción: La columna tdo_created_at es NOT NULL pero no tenía un valor
--              por defecto, así que TypeORM (@CreateDateColumn) generaba
--              "DEFAULT" en el INSERT confiando en que la base lo resolviera,
--              y la base rechazaba el insert con "Cannot insert the value
--              NULL into column 'tdo_created_at'". Esto rompía la creación
--              de cualquier tipo de documento nuevo desde la app (POST
--              /parametrizacion/tipos-documentos siempre devolvía 500).

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('Tipos_documentos')
      AND c.name = 'tdo_created_at'
)
BEGIN
    ALTER TABLE Tipos_documentos
    ADD CONSTRAINT DF_Tipos_documentos_tdo_created_at DEFAULT SYSDATETIME() FOR tdo_created_at;
    PRINT 'Default agregado a tdo_created_at';
END
ELSE
BEGIN
    PRINT 'tdo_created_at ya tiene un default';
END;

-- Verificación
SELECT
    c.name AS columna,
    dc.name AS constraint_default,
    dc.definition
FROM sys.columns c
LEFT JOIN sys.default_constraints dc
  ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE c.object_id = OBJECT_ID('Tipos_documentos')
  AND c.name = 'tdo_created_at';
