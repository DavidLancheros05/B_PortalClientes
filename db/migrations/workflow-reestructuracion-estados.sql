-- ============================================================================
-- MIGRACIÓN: Reestructuración de Estados y Workflow de Solicitudes
-- ============================================================================
-- Descripción:
--   Separa la gestión de estado en 3 conceptos independientes:
--   1. Estado cliente (sol_estado_id) — qué ve el cliente
--   2. Etapa workflow (sol_etapa_actual_id) — quién tiene la solicitud
--   3. Resultado etapa (sol_resultado_etapa_id) — aprobado/rechazado en esa etapa
--
-- Adicionalmente se agrega una tabla de historial para trazabilidad completa.
-- ============================================================================

-- ============================================================================
-- TABLA 1: workflow_etapas
-- ============================================================================
-- Las etapas del workflow por las que transita una solicitud
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type = 'U' AND name = 'workflow_etapas')
BEGIN
    CREATE TABLE workflow_etapas (
        wet_id INT PRIMARY KEY IDENTITY(1,1),
        wet_codigo VARCHAR(10) NOT NULL UNIQUE,
        wet_nombre VARCHAR(100) NOT NULL,
        wet_orden INT NOT NULL,
        wet_activo BIT DEFAULT 1,
        wet_created_at DATETIME DEFAULT GETDATE(),
        wet_updated_at DATETIME DEFAULT GETDATE()
    )

    CREATE INDEX idx_workflow_etapas_codigo ON workflow_etapas(wet_codigo)
    CREATE INDEX idx_workflow_etapas_activo ON workflow_etapas(wet_activo)
END

-- ============================================================================
-- TABLA 2: workflow_estado_etapa
-- ============================================================================
-- Los posibles resultados de una etapa
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type = 'U' AND name = 'workflow_estado_etapa')
BEGIN
    CREATE TABLE workflow_estado_etapa (
        wee_id INT PRIMARY KEY IDENTITY(1,1),
        wee_codigo VARCHAR(10) NOT NULL UNIQUE,
        wee_nombre VARCHAR(50) NOT NULL
    )

    CREATE INDEX idx_workflow_estado_etapa_codigo ON workflow_estado_etapa(wee_codigo)
END

-- ============================================================================
-- TABLA 3: solicitud_workflow_historial
-- ============================================================================
-- Registro completo de todas las transiciones de workflow para trazabilidad
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE type = 'U' AND name = 'solicitud_workflow_historial')
BEGIN
    CREATE TABLE solicitud_workflow_historial (
        swh_id BIGINT PRIMARY KEY IDENTITY(1,1),
        swh_sol_id BIGINT NOT NULL,
        swh_etapa_id INT NOT NULL,
        swh_resultado_etapa_id INT NOT NULL,
        swh_usuario_id BIGINT NOT NULL,
        swh_comentario NVARCHAR(MAX),
        swh_fecha DATETIME DEFAULT GETDATE(),

        FOREIGN KEY (swh_sol_id) REFERENCES solicitudes(sol_id),
        FOREIGN KEY (swh_etapa_id) REFERENCES workflow_etapas(wet_id),
        FOREIGN KEY (swh_resultado_etapa_id) REFERENCES workflow_estado_etapa(wee_id),
        FOREIGN KEY (swh_usuario_id) REFERENCES usuarios(usr_id)
    )

    CREATE INDEX idx_swh_solicitud ON solicitud_workflow_historial(swh_sol_id)
    CREATE INDEX idx_swh_fecha ON solicitud_workflow_historial(swh_fecha)
    CREATE INDEX idx_swh_etapa ON solicitud_workflow_historial(swh_etapa_id)
END

-- ============================================================================
-- DATOS INICIALES: Etapas del workflow
-- ============================================================================
-- Verificar si ya existen; si no, insertarlas
IF NOT EXISTS (SELECT 1 FROM workflow_etapas WHERE wet_codigo = 'EJN')
BEGIN
    INSERT INTO workflow_etapas (wet_codigo, wet_nombre, wet_orden, wet_activo)
    VALUES
        ('EJN', 'Ejecutivo Negocios', 1, 1),
        ('ASC', 'Auxiliar Servicio Cliente', 2, 1),
        ('OFC', 'Oficial Cumplimiento', 3, 1),
        ('CC1', 'Comité Crédito 1', 4, 1),
        ('CC2', 'Comité Crédito 2', 5, 1)
END

-- ============================================================================
-- DATOS INICIALES: Resultados de etapas
-- ============================================================================
-- Verificar si ya existen; si no, insertarlas
IF NOT EXISTS (SELECT 1 FROM workflow_estado_etapa WHERE wee_codigo = 'PD')
BEGIN
    INSERT INTO workflow_estado_etapa (wee_codigo, wee_nombre)
    VALUES
        ('PD', 'Pendiente'),
        ('AP', 'Aprobado'),
        ('RZ', 'Rechazado')
END

-- ============================================================================
-- ALTERAR TABLA: solicitudes
-- ============================================================================
-- Agregar las 2 columnas nuevas si no existen ya
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'solicitudes' AND COLUMN_NAME = 'sol_etapa_actual_id'
)
BEGIN
    ALTER TABLE solicitudes
    ADD sol_etapa_actual_id INT NULL,
        sol_resultado_etapa_id INT NULL

    ALTER TABLE solicitudes
    ADD CONSTRAINT fk_solicitudes_etapa FOREIGN KEY (sol_etapa_actual_id)
        REFERENCES workflow_etapas(wet_id)

    ALTER TABLE solicitudes
    ADD CONSTRAINT fk_solicitudes_resultado FOREIGN KEY (sol_resultado_etapa_id)
        REFERENCES workflow_estado_etapa(wee_id)

    CREATE INDEX idx_solicitudes_etapa_actual ON solicitudes(sol_etapa_actual_id)
    CREATE INDEX idx_solicitudes_resultado_etapa ON solicitudes(sol_resultado_etapa_id)
END

-- ============================================================================
-- MIGRACIÓN INICIAL DE DATOS
-- ============================================================================
-- Mapear los estados actuales a las nuevas columnas
-- estado_id 1 (Pendiente) → etapa EJN, resultado PD
-- estado_id 2 (Revisión Comercial) → etapa ASC, resultado PD
-- estado_id 3 (Aprobado) → etapa ASC, resultado AP
-- estado_id 4 (Rechazado) → etapa ASC, resultado RZ
-- estado_id 5 (Borrador) → etapa NULL, resultado NULL
-- ============================================================================

DECLARE @cen_id INT = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN')
DECLARE @sac_id INT = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'ASC')
DECLARE @pd_id INT = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PD')
DECLARE @ap_id INT = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'AP')
DECLARE @rz_id INT = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'RZ')

-- Solo actualizar registros que aún no han sido mapeados
UPDATE solicitudes
SET sol_etapa_actual_id = @cen_id, sol_resultado_etapa_id = @pd_id
WHERE sol_estado_id = 1 AND sol_etapa_actual_id IS NULL

UPDATE solicitudes
SET sol_etapa_actual_id = @sac_id, sol_resultado_etapa_id = @pd_id
WHERE sol_estado_id = 2 AND sol_etapa_actual_id IS NULL

UPDATE solicitudes
SET sol_etapa_actual_id = @sac_id, sol_resultado_etapa_id = @ap_id
WHERE sol_estado_id = 3 AND sol_etapa_actual_id IS NULL

UPDATE solicitudes
SET sol_etapa_actual_id = @sac_id, sol_resultado_etapa_id = @rz_id
WHERE sol_estado_id = 4 AND sol_etapa_actual_id IS NULL

-- Borrador: sin etapa ni resultado
UPDATE solicitudes
SET sol_etapa_actual_id = NULL, sol_resultado_etapa_id = NULL
WHERE sol_estado_id = 5 AND sol_etapa_actual_id IS NULL

-- ============================================================================
-- VERIFICACIÓN FINAL
-- ============================================================================
PRINT '✅ Migración completada exitosamente.'
PRINT '✅ Nuevas tablas creadas: workflow_etapas, workflow_estado_etapa, solicitud_workflow_historial'
PRINT '✅ Nuevas columnas agregadas a solicitudes: sol_etapa_actual_id, sol_resultado_etapa_id'
PRINT '✅ Datos iniciales mapeados desde estados existentes'
