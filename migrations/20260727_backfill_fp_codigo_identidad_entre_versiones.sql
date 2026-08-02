-- Solución de fondo al problema de precarga rota al cambiar de versión de
-- formulario (ver documentacion/flujo-ampliacion-de-cupo.md, sección
-- "Corrección 2026-07-27 (4)"). Cada vez que se clona una pregunta a una
-- versión nueva (FormulariosService.copiarPreguntasAVersion), recibe un
-- fp_id NUEVO (IDENTITY) aunque sea "la misma" pregunta — confirmado en
-- vivo: "Origen de fondos:" es fp_id=2715 en la versión 13 y fp_id=2812 en
-- la versión 14. La precarga de Ampliación de Cupo busca la respuesta
-- anterior por fp_id exacto, así que en cuanto la versión activa cambia
-- respecto a la de la última solicitud aprobada del cliente, deja de
-- encontrar CUALQUIER respuesta (no solo algunas).
--
-- fp_codigo ya es el mecanismo pensado para esto: es una columna más que
-- se copia igual al clonar (no cambia entre versiones), y el código ya usa
-- fp_codigo='TIPO_SOLICITUD' para reconocer esa pregunta sin importar la
-- versión. El problema no era el mecanismo, era que casi nadie lo tenía
-- asignado (9 de 100 preguntas en la versión activa).
--
-- Esta migración asigna un fp_codigo compartido a todas las preguntas
-- ACTIVAS (fp_estado=1) que hoy no lo tienen, agrupándolas por
-- (formulario_id, seccion_id, fp_descripcion, fp_tipo) — mismo texto,
-- misma sección y mismo tipo se asume la misma pregunta a través de
-- versiones (fs_secciones NO está versionada, seccion_id ya es estable
-- entre versiones, confirmado: v13 y v14 comparten las mismas 16
-- secciones). Se filtra fp_estado=1 a propósito: hay preguntas
-- "huérfanas" duplicadas con texto igual pero fp_estado=0 (ej. dos filas
-- "Tipo de solicitud" en la v14, solo una activa) que no deben mezclarse
-- en el agrupamiento.
--
-- Si el grupo ya tiene un código en alguna fila, se propaga a las demás.
-- Si ninguna fila del grupo tiene código, se genera uno nuevo
-- determinístico ('AUTO_Q<fp_id más bajo del grupo>') y se aplica a todo
-- el grupo.
--
-- Segura de re-ejecutar: solo actualiza filas con fp_codigo todavía vacío.

IF OBJECT_ID('tempdb..#grupos_fp_codigo') IS NOT NULL DROP TABLE #grupos_fp_codigo;

SELECT
  formulario_id,
  seccion_id,
  fp_descripcion,
  fp_tipo,
  MIN(fp_id) AS fp_id_ancla,
  MAX(fp_codigo) AS codigo_existente
INTO #grupos_fp_codigo
FROM Formulario_pregunta
WHERE fp_estado = 1
GROUP BY formulario_id, seccion_id, fp_descripcion, fp_tipo;

UPDATE fp
SET fp.fp_codigo = COALESCE(g.codigo_existente, CONCAT('AUTO_Q', g.fp_id_ancla))
FROM Formulario_pregunta fp
JOIN #grupos_fp_codigo g
  ON g.formulario_id = fp.formulario_id
  AND g.seccion_id = fp.seccion_id
  AND g.fp_descripcion = fp.fp_descripcion
  AND g.fp_tipo = fp.fp_tipo
WHERE fp.fp_estado = 1
  AND (fp.fp_codigo IS NULL OR fp.fp_codigo = '');

DROP TABLE #grupos_fp_codigo;
