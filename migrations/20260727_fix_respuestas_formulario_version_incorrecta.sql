-- guardarRespuestasConceptoEjecutivo / guardarRespuestasUsoExclusivo
-- (solicitudes-workflow.service.ts) resolvían las preguntas de las secciones
-- "CONCEPTO DEL EJECUTIVO DE NEGOCIOS" y "USO EXCLUSIVO DE CARTONERA
-- NACIONAL S.A." solo por fs_nombre + fp_estado, sin filtrar por
-- fp_version. Como esas preguntas existen duplicadas en varias versiones
-- del formulario (11, 13, 14), SELECT sin ORDER BY devolvía la fila de la
-- versión más vieja (11) y las respuestas quedaban guardadas contra ese
-- fp_id en vez del de la versión real de la solicitud
-- (sol_formulario_version) — por eso el formulario completo/PDF mostraba
-- "Sin respuesta" pese a que el dato sí existía en solicitudes
-- (sol_consumo_mensual_proyectado, sol_observacion_ejn, etc.) y en
-- Formulario_respuesta, solo que colgado del fp_id equivocado.
--
-- Esta migración reubica esas respuestas ya guardadas al fp_id de la
-- versión correcta para cada solicitud. Es segura de re-ejecutar: el WHERE
-- solo alcanza filas cuya versión de respuesta no coincide con
-- sol_formulario_version, así que tras la primera corrida no vuelve a
-- encontrar nada que mover.

UPDATE fr
SET fr.fr_fp_id = fp_correcta.fp_id
FROM Formulario_respuesta fr
JOIN Formulario_pregunta fp_vieja ON fp_vieja.fp_id = fr.fr_fp_id
JOIN Formulario_secciones fs ON fs.fs_id = fp_vieja.seccion_id
JOIN solicitudes s ON s.sol_id = fr.fr_solicitud_id
JOIN Formulario_pregunta fp_correcta
  ON fp_correcta.seccion_id = fp_vieja.seccion_id
  AND fp_correcta.fp_descripcion = fp_vieja.fp_descripcion
  AND ISNULL(fp_correcta.fp_version, 1) = ISNULL(s.sol_formulario_version, 1)
WHERE (fs.fs_nombre LIKE 'CONCEPTO DEL EJECUTIVO%' OR fs.fs_nombre LIKE 'USO EXCLUSIVO%')
  AND ISNULL(fp_vieja.fp_version, 1) <> ISNULL(s.sol_formulario_version, 1)
  AND NOT EXISTS (
    SELECT 1 FROM Formulario_respuesta fr_existente
    WHERE fr_existente.fr_solicitud_id = fr.fr_solicitud_id
      AND fr_existente.fr_fp_id = fp_correcta.fp_id
  );
