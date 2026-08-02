-- De 100 preguntas en la versión activa del formulario (frm_version_activa),
-- solo 15 tenían fp_precarga_fuente configurado — el resto quedaba vacío al
-- diligenciar una Ampliación de Cupo (Camino 1: FRONTEND/src/app/solicitudes/nueva),
-- porque usePrefillConfiguracion solo copia un campo desde la última solicitud
-- aprobada del cliente si su pregunta tiene fp_precarga_fuente='ultima_solicitud'
-- (o 'cliente_primero', que cae a lo mismo si no hay dato de cliente).
--
-- Esta migración activa 'ultima_solicitud' para las preguntas de la versión
-- activa que hoy no tienen ninguna fuente configurada, limitado a tipos de
-- pregunta donde copiar el valor guardado es seguro y directo (texto, número,
-- fecha, selección simple, selección de catálogo). Deliberadamente NO toca:
--   - DOCUMENTOS_TABLA / ESPACIO_FIRMA: documentos y firmas deben
--     verificarse/firmarse de nuevo en cada solicitud, no reutilizarse.
--   - TABLA: estructura de filas repetidas, usePrefillConfiguracion no la
--     soporta (solo copia un valor simple por fp_id).
--   - MULTISELECT: la precarga guarda un solo valor por fp_id y perdería
--     selecciones múltiples.
--   - NOTA: es texto informativo, no una respuesta del usuario.
--
-- Segura de re-ejecutar: el WHERE solo alcanza preguntas con
-- fp_precarga_fuente todavía vacío, así que tras la primera corrida no
-- vuelve a encontrar nada que actualizar.

UPDATE fp
SET fp.fp_precarga_fuente = 'ultima_solicitud'
FROM Formulario_pregunta fp
JOIN formularios f ON f.frm_activo = 1
WHERE fp.fp_version = ISNULL(f.frm_version_activa, fp.fp_version)
  AND (fp.fp_precarga_fuente IS NULL OR fp.fp_precarga_fuente = '')
  AND fp.fp_tipo IN ('TEXTO', 'NUMERO', 'FECHA', 'SELECT', 'SELECT_TABLA');
