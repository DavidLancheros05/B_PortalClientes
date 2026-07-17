-- La columna "Observaciones" del listado de solicitudes del cliente vivia
-- calculada en el frontend a partir de sol_estado_id/etapa/resultado, asi que
-- nunca quedaba registrada la observacion real del evento que la origino.
-- Ahora el backend la escribe en cada transicion (guardar borrador, enviar,
-- aprobar, rechazar, etc.) y el frontend solo la muestra.

ALTER TABLE solicitudes
  ADD sol_observacion_cliente NVARCHAR(500) NULL;
