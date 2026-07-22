-- Agrega las FK que nunca existieron entre las tablas "hijas" de una
-- solicitud y `solicitudes(sol_id)`, con ON DELETE CASCADE. Hasta ahora el
-- borrado de una solicitud dependía de que el código de aplicación limpiara
-- cada tabla a mano (y `deleteSolicitud` en BACKEND solo borraba
-- Formulario_respuesta) — sin la FK, nada impedía que quedaran huérfanas.
--
-- Se detectaron ~1250 filas ya huérfanas (de solicitudes de prueba borradas
-- manualmente en el pasado, sin estas llaves). Se limpian primero porque
-- SQL Server no permite crear una FK si ya hay filas que la violan.

-- 1) Limpieza de huérfanos existentes -----------------------------------

DELETE fr FROM Formulario_respuesta fr
WHERE NOT EXISTS (SELECT 1 FROM solicitudes s WHERE s.sol_id = fr.fr_solicitud_id);

DELETE sa FROM Solicitud_archivo sa
WHERE NOT EXISTS (SELECT 1 FROM solicitudes s WHERE s.sol_id = sa.sa_sol_id);

DELETE scv FROM Solicitud_carta_vinculacion scv
WHERE NOT EXISTS (SELECT 1 FROM solicitudes s WHERE s.sol_id = scv.scv_sol_id);

DELETE ssa FROM Solicitud_soporte_analisis ssa
WHERE NOT EXISTS (SELECT 1 FROM solicitudes s WHERE s.sol_id = ssa.ssa_sol_id);

DELETE swh FROM solicitud_workflow_historial swh
WHERE NOT EXISTS (SELECT 1 FROM solicitudes s WHERE s.sol_id = swh.swh_sol_id);

DELETE seh FROM Solicitudes_estados_hist seh
WHERE NOT EXISTS (SELECT 1 FROM solicitudes s WHERE s.sol_id = seh.seh_sol_id);

-- Nota: Solicitud_documento_deprecated (29 huérfanas de 32 filas) queda
-- fuera a propósito — ya fue reemplazada por Solicitud_archivo (ver
-- CLAUDE.md) y no la usa ningún código vigente.

-- 2) `solicitudes.sol_id` es IDENTITY pero nunca tuvo PRIMARY KEY ni
-- UNIQUE — sin eso ninguna FK puede referenciarlo (SQL Server lo exige).
-- Confirmado sin duplicados/nulos antes de esta migración.

IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE type = 'PK' AND parent_object_id = OBJECT_ID('solicitudes')
)
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT PK_solicitudes PRIMARY KEY (sol_id);
END

-- 3) Foreign keys con ON DELETE CASCADE ----------------------------------

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_FormularioRespuesta_Solicitud'
)
BEGIN
  ALTER TABLE Formulario_respuesta
  ADD CONSTRAINT FK_FormularioRespuesta_Solicitud
  FOREIGN KEY (fr_solicitud_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudArchivo_Solicitud'
)
BEGIN
  ALTER TABLE Solicitud_archivo
  ADD CONSTRAINT FK_SolicitudArchivo_Solicitud
  FOREIGN KEY (sa_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudCartaVinculacion_Solicitud'
)
BEGIN
  ALTER TABLE Solicitud_carta_vinculacion
  ADD CONSTRAINT FK_SolicitudCartaVinculacion_Solicitud
  FOREIGN KEY (scv_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudSoporteAnalisis_Solicitud'
)
BEGIN
  ALTER TABLE Solicitud_soporte_analisis
  ADD CONSTRAINT FK_SolicitudSoporteAnalisis_Solicitud
  FOREIGN KEY (ssa_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudWorkflowHistorial_Solicitud'
)
BEGIN
  ALTER TABLE solicitud_workflow_historial
  ADD CONSTRAINT FK_SolicitudWorkflowHistorial_Solicitud
  FOREIGN KEY (swh_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudesEstadosHist_Solicitud'
)
BEGIN
  ALTER TABLE Solicitudes_estados_hist
  ADD CONSTRAINT FK_SolicitudesEstadosHist_Solicitud
  FOREIGN KEY (seh_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END
