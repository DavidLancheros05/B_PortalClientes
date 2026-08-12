-- Configura el "Filtro de catálogo" (fp_catalogo_filtro_pregunta_id +
-- fp_catalogo_filtro_columna, agregados en
-- 20260809_agregar_filtro_catalogo_dependiente.sql) para que Departamento
-- dependa de País y Ciudad dependa de Departamento, en la versión activa
-- del formulario (fp_version = 15). Antes no tenían nada configurado — ver
-- "Documentos Cartonera/documentacion/Problemas serios/tipo_de_pregunta.md"
-- (problema 1) para el porqué no se podía hasta ahora: el mecanismo
-- genérico no soportaba una pregunta padre tipo SELECT_TABLA (arreglado en
-- F_PortalClientes/src/app/solicitudes/nueva/hooks/useCatalogoDependiente.ts).
--
-- fp_catalogo_filtro_columna es la columna del catálogo HIJO que referencia
-- al padre (Departamentoes.pai_id, Ciudads.dpto_id) — no una regla de texto:
-- con un padre SELECT_TABLA, useCatalogoDependiente ahora filtra
-- directamente por el id ya elegido en el padre.
--
-- Idempotente: los UPDATE siempre dejan el mismo valor final, se puede
-- correr más de una vez sin efecto acumulativo.

DECLARE @fpVersion INT = 15;
DECLARE @paisId INT, @deptoId INT;

SELECT @paisId = fp_id FROM Formulario_pregunta
WHERE fp_codigo = 'AUTO_Q1154' AND fp_version = @fpVersion;

SELECT @deptoId = fp_id FROM Formulario_pregunta
WHERE fp_codigo = 'AUTO_Q1155' AND fp_version = @fpVersion;

IF @paisId IS NULL OR @deptoId IS NULL
BEGIN
    RAISERROR('No se encontraron AUTO_Q1154/AUTO_Q1155 en fp_version=15 — abortando sin cambios.', 16, 1);
END
ELSE
BEGIN
    UPDATE Formulario_pregunta
    SET fp_catalogo_filtro_pregunta_id = @paisId,
        fp_catalogo_filtro_columna = 'pai_id'
    WHERE fp_codigo = 'AUTO_Q1155' AND fp_version = @fpVersion;

    UPDATE Formulario_pregunta
    SET fp_catalogo_filtro_pregunta_id = @deptoId,
        fp_catalogo_filtro_columna = 'dpto_id'
    WHERE fp_codigo = 'AUTO_Q1156' AND fp_version = @fpVersion;
END

-- Verificación
SELECT fp_id, fp_codigo, fp_descripcion, fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_columna
FROM Formulario_pregunta
WHERE fp_version = 15 AND fp_codigo IN ('AUTO_Q1154', 'AUTO_Q1155', 'AUTO_Q1156');
