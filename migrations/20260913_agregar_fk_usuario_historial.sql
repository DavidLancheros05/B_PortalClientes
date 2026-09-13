-- Cierra el pendiente de documentacion/Portal Clientes/Solicitudes/integridad.md
-- (punto 1, "🔴 Pendiente"): agrega las 2 FK de swh_usuario_id/seh_usr_id que
-- quedaron fuera de 20260802_agregar_fk_faltantes_y_limpiar_unique_duplicados.sql
-- porque 6 filas de prueba tenían un cli_id guardado ahí en vez de un usr_id
-- real (columnas NOT NULL, no se podían limpiar con UPDATE ... SET = NULL).
--
-- Verificado en vivo el 2026-09-13: esas filas ya no existen (0 huérfanos por
-- LEFT JOIN contra usuarios en ambas tablas) — no hace falta limpieza de datos
-- aquí, solo agregar las FK. El código actual tampoco vuelve a introducir el
-- problema: resolverUsuarioIdParaAuditoria (solicitudes.controller.ts) ya
-- devuelve NULL para un actor cliente, nunca su cli_id, y los callers usan el
-- fallback `usuarioId ?? 1` / `body.usuario_crea || 1` para estas dos columnas
-- NOT NULL (mismo criterio que sol_usuario_crea, pero esa sí es nullable).

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudWorkflowHistorial_Usuario')
BEGIN
  ALTER TABLE solicitud_workflow_historial
  ADD CONSTRAINT FK_SolicitudWorkflowHistorial_Usuario
  FOREIGN KEY (swh_usuario_id) REFERENCES usuarios(usr_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudesEstadosHist_Usuario')
BEGIN
  ALTER TABLE Solicitudes_estados_hist
  ADD CONSTRAINT FK_SolicitudesEstadosHist_Usuario
  FOREIGN KEY (seh_usr_id) REFERENCES usuarios(usr_id);
END
