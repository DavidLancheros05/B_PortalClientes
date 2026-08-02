-- Segunda parte de la activación de precarga de Ampliación de Cupo (ver
-- 20260727_activar_precarga_ultima_solicitud_preguntas_faltantes.sql). Esa
-- primera migración dejó fuera TABLA y MULTISELECT porque
-- usePrefillConfiguracion/useUltimaSolicitudAprobada no los soportaban
-- correctamente:
--   - TABLA guarda sus filas como un único JSON en fr_valor_texto (una sola
--     fila de Formulario_respuesta) — en realidad siempre fue seguro
--     copiarlo igual que un TEXTO, no requería cambio de código.
--   - MULTISELECT guarda una fila de Formulario_respuesta por cada opción
--     marcada, todas con el mismo fr_fp_id — la indexación simple usada
--     hasta ahora se quedaba solo con la última fila leída, perdiendo
--     opciones. Se corrigió agregando a useUltimaSolicitudAprobada la misma
--     agrupación por fp_id + ventana de tiempo que ya usaba
--     useSolicitudEdicion.ts (ver F_PortalClientes/src/lib/agruparUltimaRespuestaPorPregunta.ts).
--
-- DOCUMENTOS_TABLA, ESPACIO_FIRMA y NOTA siguen fuera de la precarga
-- deliberadamente: documentos y firmas deben verificarse/firmarse de nuevo
-- en cada solicitud (decisión de negocio, no limitación técnica); NOTA es
-- texto informativo, no una respuesta del usuario.
--
-- Segura de re-ejecutar: el WHERE solo alcanza preguntas con
-- fp_precarga_fuente todavía vacío.

UPDATE fp
SET fp.fp_precarga_fuente = 'ultima_solicitud'
FROM Formulario_pregunta fp
JOIN formularios f ON f.frm_activo = 1
WHERE fp.fp_version = ISNULL(f.frm_version_activa, fp.fp_version)
  AND (fp.fp_precarga_fuente IS NULL OR fp.fp_precarga_fuente = '')
  AND fp.fp_tipo IN ('TABLA', 'MULTISELECT');
