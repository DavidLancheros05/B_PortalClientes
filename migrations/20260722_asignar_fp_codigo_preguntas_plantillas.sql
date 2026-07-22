-- Asigna fp_codigo (código lógico estable) a las preguntas que las
-- plantillas de documentos usan como variables. El código identifica a la
-- pregunta LÓGICA a través de renames y versiones nuevas del formulario
-- (el clonado de versión lo copia), a diferencia del fp_id (rota por
-- versionado) y del texto visible (rota por renames — ya causó plantillas
-- generadas con campos en blanco, ver "Tabla represéntate legal").
-- Los placeholders {{pregunta|cod:<CODIGO>|...}} de las plantillas y la
-- búsqueda del representante legal (frontend y backend) resuelven por
-- este código, con fallback al formato viejo por sección+texto.
--
-- Idempotente: sólo escribe donde fp_codigo sigue NULL.

-- Tabla del representante legal principal (todas las versiones)
UPDATE Formulario_pregunta SET fp_codigo = 'REP_LEGAL_TABLA'
WHERE fp_id IN (1226, 2563, 2658) AND fp_codigo IS NULL;

-- Tabla de representantes suplentes (todas las versiones)
UPDATE Formulario_pregunta SET fp_codigo = 'REP_LEGAL_SUPLENTES'
WHERE fp_id IN (2612, 2702) AND fp_codigo IS NULL;

-- Razón social (sección 1, todas las versiones)
UPDATE Formulario_pregunta SET fp_codigo = 'RAZON_SOCIAL'
WHERE fp_id IN (1046, 1071, 1090, 1109, 1152, 2532, 2688) AND fp_codigo IS NULL;

-- No. Identificación / NIT (sección 1, todas las versiones)
UPDATE Formulario_pregunta SET fp_codigo = 'NIT'
WHERE fp_id IN (1047, 1072, 1091, 1110, 1153, 2529, 2615) AND fp_codigo IS NULL;

SELECT fp_codigo, COUNT(*) AS preguntas
FROM Formulario_pregunta
WHERE fp_codigo IN ('REP_LEGAL_TABLA', 'REP_LEGAL_SUPLENTES', 'RAZON_SOCIAL', 'NIT')
GROUP BY fp_codigo;
