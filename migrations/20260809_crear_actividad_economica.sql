-- Catálogo de actividades económicas (CIIU) para la pregunta única
-- "Actividad Económica (CIIU)" de Información General, reemplazando los dos
-- campos separados (Actividad Económica / Código CIIU) que hoy no pueden
-- autocompletarse entre sí.
--
-- ae_label es una columna CALCULADA (código + ' - ' + actividad), PERSISTED
-- para que quede indexable/consultable como cualquier columna normal. Es la
-- que se usa como "columna a mostrar" en la pregunta tipo "Selección desde
-- tabla": el motor de formularios (Formulario_pregunta.fp_catalogo_columna)
-- solo soporta una única columna de descripción, así que en vez de tocar
-- ese motor para que combine dos columnas, se resuelve a nivel de datos.
-- Como es calculada, nunca puede desincronizarse de ae_codigo/ae_actividad.
IF OBJECT_ID('dbo.actividad_economica', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.actividad_economica (
    ae_id INT IDENTITY(1,1) PRIMARY KEY,
    ae_codigo VARCHAR(10) NOT NULL,
    ae_actividad NVARCHAR(255) NOT NULL,
    ae_label AS (ae_codigo + ' - ' + ae_actividad) PERSISTED,
    ae_activo BIT NOT NULL DEFAULT 1,
    CONSTRAINT UQ_actividad_economica_codigo UNIQUE (ae_codigo)
  );
END
