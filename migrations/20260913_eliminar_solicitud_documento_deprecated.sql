-- Cierra el pendiente de documentacion/Portal Clientes/Solicitudes/integridad.md
-- (punto 3, "🟡 Medio"): elimina Solicitud_documento_deprecated, reemplazada
-- por Solicitud_archivo (ver CLAUDE.md, sección "Merge de Solicitud_documento").
-- Confirmado en vivo el 2026-09-13: 0 referencias en código (BACKEND/FRONTEND),
-- HEAP sin PK/FK, 32 filas (30 huérfanas contra solicitudes). A pedido
-- explícito del usuario: borrado definitivo, no archivado por rename.

IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Solicitud_documento_deprecated')
BEGIN
  DROP TABLE Solicitud_documento_deprecated;
END
