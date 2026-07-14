-- Ampliación de cupo iniciada por el Ejecutivo de Negocios: en vez de una
-- tabla `ampliacion_cupo` aparte (descartada por redundante, ver
-- documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md),
-- el monto solicitado y la justificación quedan como columnas directas en
-- `solicitudes` — un solo lugar con todo el estado de la ampliación (etapa,
-- resultado, cupo pedido, justificación), sin copia que se desactualice.

ALTER TABLE solicitudes
  ADD sol_cupo_solicitado DECIMAL(18, 2) NULL,
      sol_justificacion_ampliacion NVARCHAR(MAX) NULL;
