-- La pregunta interactiva "Estoy de acuerdo" (checkbox SI/NO, fp_tipo=SELECT
-- subtipo=CHECK) de la seccion "ACUERDO DE INFORMACION RELEVANTE - CIRCULAR
-- 0-170" quedo con fp_estado=0 en la version 13 (la activa) del formulario,
-- probablemente al crear esa version desde v11 donde ya estaba asi. El
-- cliente solo veia el texto legal (que en su ultima linea dice "Estoy de
-- acuerdo" como parte del parrafo) sin ninguna forma de marcarlo, porque la
-- pregunta que renderiza el checkbox real estaba desactivada.
--
-- Idempotente: solo actualiza si sigue en 0.

UPDATE Formulario_pregunta
SET fp_estado = 1
WHERE fp_id = 2776 AND fp_estado = 0;

SELECT fp_id, fp_descripcion, fp_estado
FROM Formulario_pregunta
WHERE fp_id = 2776;
