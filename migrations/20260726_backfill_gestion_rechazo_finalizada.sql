-- Backfill: las solicitudes ya rechazadas antes de este despliegue se
-- marcan como "ya consideradas finales" para que no aparezcan
-- retroactivamente en la bandeja nueva del ejecutivo — esta funcionalidad
-- aplica solo hacia adelante (decisión confirmada con el usuario). Correr
-- después de 20260726_agregar_gestion_rechazo_ejecutivo.sql. Idempotente
-- (safe de correr más de una vez).

UPDATE solicitudes
SET sol_gestion_rechazo_finalizada = 1
WHERE sol_estado_id = (SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'RECHAZADA')
  AND sol_gestion_rechazo_finalizada = 0;
