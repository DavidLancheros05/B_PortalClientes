-- Elimina 10 columnas muertas de `solicitudes` que nunca se leen ni se
-- escriben en ningún servicio del backend (solo existían como declaración
-- en solicitud.entity.ts, algunas también como tipo TS sin usar en el
-- frontend). Ver Documentos Cartonera/documentacion/Solicitudes/conceptos_iniciales.md.
--
-- Verificado en vivo (2026-09-12) con COUNT(*) sobre TODA la tabla (no solo
-- una muestra): las 10 están en NULL en el 100% de las filas existentes.
-- Sin índices ni FKs sobre ninguna.
--
-- Grupo 1 — "progreso de llenado del formulario", funcionalidad que parece
-- haberse diseñado en la BD pero nunca implementado en el backend:
--   sol_fecha_inicio_llenado, sol_fecha_ultima_respuesta,
--   sol_estado_llenado, sol_campos_completados, sol_campos_totales,
--   sol_formulario_progreso_porcentaje
--
-- Grupo 2 — restos de un esquema de fechas más viejo/genérico
-- ("respuesta comercial/financiera") de antes de que existieran las 5
-- columnas específicas por etapa (EJN/ASC/OFC/CC1/CC2). OJO:
-- sol_fecha_estimada_respuesta_comercial (sin "real", sin "financiera") NO
-- se toca aquí — esa sí está viva (se escribe en
-- solicitudes-workflow.service.ts::aprobarRechazarSolicitud y se usa como
-- respaldo en las 5 pantallas de gestión):
--   sol_fecha_estimada_respuesta, sol_fecha_estimada_respuesta_financiera,
--   sol_fecha_real_respuesta_financiera, sol_fecha_real_respuesta_comercial

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_fecha_inicio_llenado')
    ALTER TABLE solicitudes DROP COLUMN sol_fecha_inicio_llenado;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_fecha_ultima_respuesta')
    ALTER TABLE solicitudes DROP COLUMN sol_fecha_ultima_respuesta;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_estado_llenado')
    ALTER TABLE solicitudes DROP COLUMN sol_estado_llenado;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_campos_completados')
    ALTER TABLE solicitudes DROP COLUMN sol_campos_completados;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_campos_totales')
    ALTER TABLE solicitudes DROP COLUMN sol_campos_totales;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_formulario_progreso_porcentaje')
    ALTER TABLE solicitudes DROP COLUMN sol_formulario_progreso_porcentaje;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_fecha_estimada_respuesta')
    ALTER TABLE solicitudes DROP COLUMN sol_fecha_estimada_respuesta;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_fecha_estimada_respuesta_financiera')
    ALTER TABLE solicitudes DROP COLUMN sol_fecha_estimada_respuesta_financiera;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_fecha_real_respuesta_financiera')
    ALTER TABLE solicitudes DROP COLUMN sol_fecha_real_respuesta_financiera;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_fecha_real_respuesta_comercial')
    ALTER TABLE solicitudes DROP COLUMN sol_fecha_real_respuesta_comercial;
