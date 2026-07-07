-- Migración: Agregar campos de condiciones financieras a tabla solicitudes
-- Fecha: 2026-05-18
-- Descripción: Agrega campos para guardar cupo aprobado, plazo de pago, forma de pago y usuario que aprueba

-- Verificar si las columnas ya existen antes de agregarlas
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'solicitudes' AND COLUMN_NAME = 'sol_cupo_aprobado'
)
BEGIN
    ALTER TABLE solicitudes
    ADD sol_cupo_aprobado DECIMAL(18, 2) NULL;
    PRINT 'Columna sol_cupo_aprobado agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sol_cupo_aprobado ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'solicitudes' AND COLUMN_NAME = 'sol_plazo_pago'
)
BEGIN
    ALTER TABLE solicitudes
    ADD sol_plazo_pago INT NULL;
    PRINT 'Columna sol_plazo_pago agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sol_plazo_pago ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'solicitudes' AND COLUMN_NAME = 'sol_forma_pago'
)
BEGIN
    ALTER TABLE solicitudes
    ADD sol_forma_pago NVARCHAR(100) NULL;
    PRINT 'Columna sol_forma_pago agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sol_forma_pago ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'solicitudes' AND COLUMN_NAME = 'sol_usuario_aprueba_condiciones'
)
BEGIN
    ALTER TABLE solicitudes
    ADD sol_usuario_aprueba_condiciones INT NULL;
    PRINT 'Columna sol_usuario_aprueba_condiciones agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sol_usuario_aprueba_condiciones ya existe';
END;

-- Verificar las columnas creadas
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'solicitudes'
  AND COLUMN_NAME IN ('sol_cupo_aprobado', 'sol_plazo_pago', 'sol_forma_pago', 'sol_usuario_aprueba_condiciones')
ORDER BY COLUMN_NAME;
