-- Bug real: "No. Identificación" (fp_id=2926, sección DATOS DE
-- IDENTIFICACIÓN) es tipo NUMERO, pero el NIT/identificación real de la
-- gran mayoría de clientes NO es un número puro — trae guion + dígito de
-- verificación o formatos extranjeros con letras/espacios. Confirmado
-- contra la BD: 120 de 1670 clientes (~7%) tienen caracteres no numéricos
-- en Clientes.cli_nro_identificacion (ej. "901687292-0", "900130529-6",
-- "J-30491169-6", "R.U.C E-8-47791 D.V. 09" — el mismo diagnóstico que ya
-- dejó cliente-datos-normalizados.service.ts al excluir 'NIT' del mapeo de
-- sincronización de vuelta a Clientes).
--
-- Con <input type="number">, esos clientes NO PUEDEN escribir su
-- identificación real en el formulario, y la precarga desde Clientes falla
-- en silencio (normalizarValorCliente hace Number("901687292-0") = NaN,
-- el campo queda vacío) — caso reportado en vivo: cliente "SHIELD MAR
-- S.A.S." (cli_id=13605, cli_nro_identificacion="901687292-0").
--
-- Fix: cambiar la pregunta a TEXTO (sin fp_patron — la diversidad real de
-- formatos, incluidas letras y espacios, hace que cualquier patrón
-- estricto termine rechazando casos válidos) y migrar las respuestas ya
-- guardadas de fr_valor_numero a fr_valor_texto para que no desaparezcan
-- al re-renderizar como TEXTO.

UPDATE Formulario_respuesta
SET fr_valor_texto = CAST(CAST(fr_valor_numero AS BIGINT) AS VARCHAR(30)),
    fr_valor_numero = NULL
WHERE fr_fp_id = 2926 AND fr_valor_numero IS NOT NULL;

UPDATE Formulario_pregunta
SET fp_tipo = 'TEXTO', fp_subtipo = 'TEXTO', fp_patron = NULL
WHERE fp_id = 2926;
