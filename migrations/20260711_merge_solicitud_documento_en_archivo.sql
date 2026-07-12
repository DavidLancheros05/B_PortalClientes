-- Fusiona Solicitud_documento en Solicitud_archivo.
-- Antes: la vigencia (sa_fecha_emision/sa_fecha_vencimiento/sa_requiere_cambio) se guardaba
-- por (solicitud, tipo_documento) en Solicitud_documento, separada de los archivos
-- reales en Solicitud_archivo (redundancia + imposibilidad de vigencia independiente
-- cuando dos preguntas de formulario comparten el mismo tipo de documento).
-- Ahora cada archivo tiene su propia vigencia.

-- 1. Columnas nuevas en Solicitud_archivo (sa_fecha_vencimiento ya existía y estaba sin usar)
IF COL_LENGTH('Solicitud_archivo', 'sa_fecha_emision') IS NULL
  ALTER TABLE Solicitud_archivo ADD sa_fecha_emision DATE NULL;

IF COL_LENGTH('Solicitud_archivo', 'sa_requiere_cambio') IS NULL
  ALTER TABLE Solicitud_archivo ADD sa_requiere_cambio BIT NOT NULL CONSTRAINT DF_sa_requiere_cambio DEFAULT 0;
GO

-- 2. Backfill: copiar cada fila de Solicitud_documento al archivo activo más
-- reciente que comparta sa_sol_id + fp_id (vía Formulario_pregunta.fp_tipo_documento_id).
;WITH target AS (
  SELECT sa.sa_id, sd.sd_fecha_emision, sd.sd_fecha_vencimiento, sd.sd_requiere_cambio,
         ROW_NUMBER() OVER (PARTITION BY sd.sd_id, sa.sa_fp_id ORDER BY sa.sa_created_at DESC) AS rn
  FROM Solicitud_documento sd
  JOIN Formulario_pregunta fp ON fp.fp_tipo_documento_id = sd.sd_tipo_documento_id
  JOIN Solicitud_archivo sa ON sa.sa_sol_id = sd.sd_solicitud_id
    AND sa.sa_fp_id = fp.fp_id AND sa.sa_estado = 'activo'
)
UPDATE sa
SET sa.sa_fecha_emision = t.sd_fecha_emision,
    sa.sa_fecha_vencimiento = t.sd_fecha_vencimiento,
    sa.sa_requiere_cambio = t.sd_requiere_cambio
FROM Solicitud_archivo sa
JOIN target t ON t.sa_id = sa.sa_id AND t.rn = 1;
GO

-- 3. Renombrar la tabla vieja (no DROP) - backup reversible.
EXEC sp_rename 'Solicitud_documento', 'Solicitud_documento_deprecated';
