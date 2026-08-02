-- Tracker secundario de "el ejecutivo de negocios ya hizo seguimiento
-- manual con el cliente" tras un rechazo definitivo de Oficial de
-- Cumplimiento o Comité de Crédito 2. NO reemplaza ni toca
-- sol_estado_id/sol_etapa_actual_id/sol_resultado_etapa_id, que siguen
-- terminando en RECHAZADA exactamente igual que documenta
-- documentacion/FLUJO_ETAPAS.md. Ver notificaciones.service.ts::
-- notificarRechazoAlEjecutivo y solicitudes-listados.service.ts::
-- getSolicitudesRechazadasPorEjecutivoId / getRechazoEjecutivoDetalle.
--
-- El backfill de datos existentes va en un archivo aparte
-- (20260726_backfill_gestion_rechazo_finalizada.sql) porque
-- scripts/db-query.mjs ejecuta el .sql completo como un solo batch (sin
-- separadores GO) y SQL Server no resuelve una columna agregada por ALTER
-- TABLE dentro del mismo batch en el que además se referencia esa columna.

IF COL_LENGTH('solicitudes', 'sol_gestion_rechazo_finalizada') IS NULL
  ALTER TABLE solicitudes ADD sol_gestion_rechazo_finalizada BIT NOT NULL DEFAULT 0;

IF COL_LENGTH('solicitudes', 'sol_fecha_gestion_rechazo') IS NULL
  ALTER TABLE solicitudes ADD sol_fecha_gestion_rechazo DATETIME2 NULL;

IF COL_LENGTH('solicitudes', 'sol_usuario_gestion_rechazo') IS NULL
  ALTER TABLE solicitudes ADD sol_usuario_gestion_rechazo INT NULL;
