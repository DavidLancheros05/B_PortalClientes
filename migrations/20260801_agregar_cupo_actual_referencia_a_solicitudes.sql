-- El formulario de "Ampliación de Cupo" iniciado por el Ejecutivo
-- (FRONTEND/src/app/solicitudes/solicitud-ampliacion-cupo) reemplaza el paso
-- normal de gestión del Ejecutivo de Negocios (que se salta para este tipo
-- de solicitud cuando no hay documentos vencidos, ver
-- documentacion/flujo-ampliacion-de-cupo.md). Por eso captura el cupo
-- vigente del cliente al momento de pedir la ampliación (autocargado desde
-- sol_cupo_aprobado de la última solicitud, o escrito a mano si no se
-- encuentra) — hasta ahora ese dato se pedía en el formulario pero se
-- descartaba, sin quedar guardado en ningún lado.
ALTER TABLE solicitudes
  ADD sol_cupo_actual_referencia DECIMAL(18, 2) NULL;
