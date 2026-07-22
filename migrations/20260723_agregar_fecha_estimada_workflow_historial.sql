-- Agrega la fecha estimada "vigente" por transición de etapa. Hasta ahora
-- las 5 columnas sol_fecha_estimada_* de `solicitudes` se calculaban una
-- sola vez, en paralelo, desde la fecha de creación de la solicitud — nunca
-- se recalculaban al entrar realmente a cada etapa, así que las etapas
-- tardías del flujo (Oficial de Cumplimiento, Comités) nacían vencidas o
-- casi vencidas. Esas 5 columnas se dejan intactas como "estimación
-- inicial" (snapshot histórico); esta columna nueva guarda, por cada fila
-- de historial (una por transición), la fecha estimada calculada en el
-- momento real en que la solicitud entró a esa etapa.
--
-- Nullable: las filas de historial ya existentes no se recalculan
-- retroactivamente.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('solicitud_workflow_historial')
    AND name = 'swh_fecha_estimada'
)
BEGIN
  ALTER TABLE solicitud_workflow_historial ADD swh_fecha_estimada DATETIME NULL;
END
