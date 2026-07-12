-- Permite ocultar una sección o una pregunta puntual del formulario en vivo
-- (mientras el cliente diligencia), sin dejar de incluirla en el PDF final
-- de la solicitud una vez tiene respuesta. Pensado para documentos que se
-- generan DESPUÉS de guardar la solicitud (plantillas con {{numero_solicitud}}
-- y similares) y por lo tanto no se pueden diligenciar en el momento.

IF COL_LENGTH('Formulario_secciones', 'fs_oculta_en_formulario') IS NULL
  ALTER TABLE Formulario_secciones ADD fs_oculta_en_formulario BIT NOT NULL CONSTRAINT DF_fs_oculta_en_formulario DEFAULT 0;

IF COL_LENGTH('Formulario_pregunta', 'fp_oculto_en_formulario') IS NULL
  ALTER TABLE Formulario_pregunta ADD fp_oculto_en_formulario BIT NOT NULL CONSTRAINT DF_fp_oculto_en_formulario DEFAULT 0;

-- wee_codigo es varchar(10); los códigos existentes (PENDIENTE, APROBADO,
-- RECHAZADO) ya usan casi todo ese espacio, así que este queda abreviado.
IF NOT EXISTS (SELECT 1 FROM workflow_estado_etapa WHERE wee_codigo = 'PEND_DOCS')
  INSERT INTO workflow_estado_etapa (wee_codigo, wee_nombre, wee_activo, wee_fecha_creacion)
  VALUES ('PEND_DOCS', 'Pendiente de documentos generados', 1, GETDATE());
