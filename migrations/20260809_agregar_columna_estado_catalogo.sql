-- Permite declarar explícitamente, por pregunta SELECT_TABLA, cuál es la
-- columna de "estado/activo" del catálogo externo y qué valor cuenta como
-- activo — hoy MaestrosService.detectarColumnaEstado la adivina por
-- convención de nombre (%estado%/%activo%) sin que el admin la vea ni
-- pueda corregirla desde el editor. Ver
-- "Documentos Cartonera/documentacion/Problemas serios/tipo_de_pregunta.md"
-- (problema 2).
--
-- Ambas columnas quedan NULL por defecto: si se dejan vacías, el backend
-- sigue adivinando como hasta ahora (compatibilidad hacia atrás, no rompe
-- preguntas ya configuradas).
--
-- Nota: para columnas CATALOGO dentro de una pregunta TABLA (fp_tabla_columnas),
-- el mismo par de campos vive dentro del JSON por columna
-- (catalogo_columna_estado/catalogo_valor_activo), no como columna de BD
-- aparte — no requiere migración de esquema.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_columna_estado'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_catalogo_columna_estado VARCHAR(100) NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_valor_activo'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_catalogo_valor_activo VARCHAR(100) NULL;
END

SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Formulario_pregunta'
  AND COLUMN_NAME IN ('fp_catalogo_columna_estado', 'fp_catalogo_valor_activo');
