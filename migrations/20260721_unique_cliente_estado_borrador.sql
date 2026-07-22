-- Prevenir múltiples solicitudes en estado "Borrador" por cliente
-- Solo un cliente puede tener UNA solicitud en estado 1 (BORRADOR) a la vez

-- Primero, limpiar duplicados si existen (mantener la más reciente)
WITH RankedSolicitudes AS (
  SELECT
    sol_id,
    sol_cliente_id,
    ROW_NUMBER() OVER (PARTITION BY sol_cliente_id ORDER BY sol_fecha_creacion DESC) AS rn
  FROM solicitudes
  WHERE sol_estado_id = 1  -- BORRADOR
)
DELETE FROM RankedSolicitudes
WHERE rn > 1;

-- Crear índice UNIQUE filtrado para BORRADOR
-- (SQL Server soporta WHERE en CREATE INDEX pero no en ALTER TABLE ADD CONSTRAINT)
CREATE UNIQUE INDEX IDX_UQ_cliente_borrador
ON solicitudes (sol_cliente_id)
WHERE sol_estado_id = 1;

-- Constraint adicional: número de solicitud por centro operativo debe ser único
-- Primero verificar si ya existe
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_NAME = 'solicitudes'
    AND CONSTRAINT_NAME = 'UQ_numero_solicitud_centro'
    AND CONSTRAINT_TYPE = 'UNIQUE'
)
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT UQ_numero_solicitud_centro
  UNIQUE (sol_numero_solicitud, sol_co_id);
END
