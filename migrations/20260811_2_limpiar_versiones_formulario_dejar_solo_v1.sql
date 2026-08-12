-- A pedido del usuario: eliminar todo el historial de versiones anteriores
-- del formulario de solicitud (formulario_id=1) y dejar únicamente la
-- versión activa (frm_version_activa=15 al momento de esta migración),
-- renumerada como versión 1.
--
-- Verificado antes de ejecutar (2026-08-11): ninguna tabla con datos en vivo
-- depende de las versiones que se borran — Formulario_respuesta,
-- Solicitud_archivo y Solicitud_evidencia_persona (las únicas con FK real o
-- referencia lógica a Formulario_pregunta.fp_id) están en 0 filas, y
-- `solicitudes` también está vacía. Las auto-referencias internas de la
-- v15 (fp_pregunta_padre_id, fp_tabla_limite_pregunta_id,
-- fp_catalogo_filtro_pregunta_id) apuntan todas a preguntas de la misma
-- v15, así que no quedan punteros rotos tras borrar el resto.
--
-- NO segura de re-ejecutar tal cual (el segundo bloque asume que todavía
-- existe una versión distinta de 1 para renumerar); si se vuelve a correr
-- después de aplicada, los DELETE no encontrarán filas y el UPDATE de
-- fp_version no tendrá efecto — no hace daño, pero es no-op.

DELETE fpo
FROM Formulario_pregunta_opcion fpo
JOIN Formulario_pregunta fp ON fp.fp_id = fpo.fpo_fp_id
WHERE fp.fp_version <> 15;

DELETE FROM Formulario_pregunta WHERE fp_version <> 15;

UPDATE Formulario_pregunta SET fp_version = 1 WHERE fp_version = 15;

UPDATE Formularios SET frm_version_activa = 1 WHERE frm_id = 1;
