-- Paso 2/2 — ver
-- 20260727_agregar_fpo_codigo_identidad_opciones_entre_versiones.sql (debe
-- correr primero, agrega la columna fpo_codigo).
--
-- Asigna fpo_codigo a las 395 opciones activas (fpo_estado=1) de preguntas
-- activas (fp_estado=1), agrupando por (fp_codigo de la pregunta dueña,
-- fpo_valor) — ya verificado que no hay dos opciones con el mismo texto
-- dentro de una misma pregunta activa, no hay ambigüedad que resolver aquí
-- (a diferencia del backfill de fp_codigo, que sí tuvo un caso real de
-- colisión con DOCUMENTOS_TABLA en la v9).
--
-- Segura de re-ejecutar: el UPDATE solo alcanza filas con fpo_codigo
-- todavía vacío.

IF OBJECT_ID('tempdb..#grupos_fpo_codigo') IS NOT NULL DROP TABLE #grupos_fpo_codigo;

SELECT
  fp.fp_codigo AS pregunta_codigo,
  fpo.fpo_valor,
  MIN(fpo.fpo_id) AS fpo_id_ancla,
  MAX(fpo.fpo_codigo) AS codigo_existente
INTO #grupos_fpo_codigo
FROM Formulario_pregunta_opcion fpo
JOIN Formulario_pregunta fp ON fp.fp_id = fpo.fpo_fp_id
WHERE fpo.fpo_estado = 1 AND fp.fp_estado = 1 AND fp.fp_codigo IS NOT NULL
GROUP BY fp.fp_codigo, fpo.fpo_valor;

UPDATE fpo
SET fpo.fpo_codigo = COALESCE(g.codigo_existente, CONCAT('AUTO_O', g.fpo_id_ancla))
FROM Formulario_pregunta_opcion fpo
JOIN Formulario_pregunta fp ON fp.fp_id = fpo.fpo_fp_id
JOIN #grupos_fpo_codigo g
  ON g.pregunta_codigo = fp.fp_codigo
  AND g.fpo_valor = fpo.fpo_valor
WHERE fpo.fpo_estado = 1
  AND fp.fp_estado = 1
  AND (fpo.fpo_codigo IS NULL OR fpo.fpo_codigo = '');

DROP TABLE #grupos_fpo_codigo;
