-- A pedido del usuario, tras revisar qué preguntas no deberían heredar la
-- respuesta de la última solicitud aprobada en una Ampliación de Cupo
-- (documentacion/flujo-ampliacion-de-cupo.md):
--
-- 1. "Nombre/Cargo del Funcionario que diligencia": no es un dato del
--    cliente, es sobre quién está llenando el formulario en este momento —
--    precargarlo puede dejar el nombre de alguien que ya no trabaja ahí.
-- 2. "Cupo Solicitado": es el propósito mismo de la Ampliación de Cupo. Con
--    precarga activa, un cliente que no toca el campo reenvía el mismo
--    monto que ya tenía aprobado — el formulario no le pide nada nuevo.
--
-- Se actualiza por fp_codigo (identidad estable entre versiones) y
-- fp_estado=1, no por fp_id fijo, para que quede corregido en cualquier
-- versión activa presente o futura, igual que el patrón de
-- 20260727_activar_precarga_ultima_solicitud_preguntas_faltantes.sql.
UPDATE Formulario_pregunta
SET fp_precarga_fuente = NULL
WHERE fp_codigo IN ('AUTO_Q1055', 'AUTO_Q1056', 'CUPO_SOLICITADO')
  AND fp_estado = 1
  AND fp_precarga_fuente IS NOT NULL;
