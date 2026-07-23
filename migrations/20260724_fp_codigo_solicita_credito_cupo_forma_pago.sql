-- useSolicitudCupoSolicitado.ts (frontend) usaba fp_id hardcodeados (2249,
-- 1217) que solo existen en la version 9 del formulario. Cualquier
-- solicitud diligenciada contra una version mas nueva (10/11/13...) no
-- encontraba respuesta y el hook devolvia solicitaCredito=null, que el
-- render trataba como falsy -> se mostraba "No" aunque el cliente hubiera
-- respondido "Si" (ver Registrar Concepto Ejecutivo, solicitud 18/v13).
--
-- Mismo patron de fondo que ya se aplico a las plantillas de documentos:
-- ancla por fp_codigo (estable ante nuevas versiones), no por fp_id.
--
-- Idempotente: solo escribe donde fp_codigo sigue NULL.

UPDATE Formulario_pregunta SET fp_codigo = 'SOLICITA_CREDITO'
WHERE fp_id IN (2249, 2600, 2684, 2790) AND fp_codigo IS NULL;

UPDATE Formulario_pregunta SET fp_codigo = 'CUPO_SOLICITADO'
WHERE fp_id IN (1217, 2553, 2648, 2712) AND fp_codigo IS NULL;

UPDATE Formulario_pregunta SET fp_codigo = 'FORMA_PAGO_SOLICITADA'
WHERE fp_id IN (1218, 2572, 2692, 2780) AND fp_codigo IS NULL;

SELECT fp_codigo, COUNT(*) AS preguntas
FROM Formulario_pregunta
WHERE fp_codigo IN ('SOLICITA_CREDITO', 'CUPO_SOLICITADO', 'FORMA_PAGO_SOLICITADA')
GROUP BY fp_codigo;
