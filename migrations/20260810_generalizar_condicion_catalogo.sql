-- Generaliza el mecanismo agregado en 20260809_agregar_columna_estado_catalogo.sql:
-- "columna de estado / valor activo" pasa a ser una condición estática
-- genérica (columna = valor exacto), no atada a semántica de activo/inactivo.
-- Motivo: el nombre "estado/activo" quedaba quemado a un solo caso de uso, y
-- además "filtro" (nombre más genérico obvio) ya está tomado por el mecanismo
-- de dependencia FK (fp_catalogo_filtro_pregunta_id, catalogo_columna_filtro)
-- que es un concepto distinto (filtro dinámico por respuesta de otra
-- pregunta, no una condición fija). Ver
-- "Documentos Cartonera/documentacion/Problemas serios/tipo_de_pregunta.md".
--
-- Comportamiento sin cambios cuando ambos campos quedan vacíos: el backend
-- sigue detectando la columna de estado por convención de nombre
-- (%estado%/%activo%) y aceptando 'A'/'ACTIVO'/'SI'/'S'/true. Verificado
-- antes de escribir esta migración: 0 filas de Formulario_pregunta usan hoy
-- fp_catalogo_columna_estado/fp_catalogo_valor_activo, así que el rename es
-- seguro sin script de "ida y vuelta".

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_columna_estado'
)
AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_columna_condicion'
)
BEGIN
    EXEC sp_rename 'Formulario_pregunta.fp_catalogo_columna_estado', 'fp_catalogo_columna_condicion', 'COLUMN';
END

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_valor_activo'
)
AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_catalogo_valor_condicion'
)
BEGIN
    EXEC sp_rename 'Formulario_pregunta.fp_catalogo_valor_activo', 'fp_catalogo_valor_condicion', 'COLUMN';
END

-- Columnas CATALOGO dentro de una pregunta TABLA guardan el mismo par de
-- claves dentro del JSON de fp_tabla_columnas (catalogo_columna_estado/
-- catalogo_valor_activo) en vez de como columna de BD aparte — hay que
-- renombrar las claves en el JSON ya guardado (1 fila conocida hoy, fp_id
-- 3010 "Direcciones", con Pais/Departamento/Ciudad).
UPDATE Formulario_pregunta
SET fp_tabla_columnas = REPLACE(
    REPLACE(fp_tabla_columnas, '"catalogo_columna_estado"', '"catalogo_columna_condicion"'),
    '"catalogo_valor_activo"', '"catalogo_valor_condicion"'
)
WHERE fp_tabla_columnas LIKE '%catalogo_columna_estado%'
   OR fp_tabla_columnas LIKE '%catalogo_valor_activo%';

SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Formulario_pregunta'
  AND COLUMN_NAME IN ('fp_catalogo_columna_condicion', 'fp_catalogo_valor_condicion');
