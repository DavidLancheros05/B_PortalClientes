-- Oculta la pregunta de Manifestación suscrita (F-P3-07, tdo_id=15) durante
-- el diligenciamiento del formulario v9, y crea la pregunta DOCUMENTOS_TABLA
-- de F-P3-06 (tdo_id=24) en la sección ACUERDO (fs_id=2007), también oculta.
-- Ambas quedan como "documentos diferidos": no se piden mientras el cliente
-- llena el formulario, pero bloquean el paso a Ejecutivo de Negocios hasta
-- que se generen/suban desde Mis Documentos (ver FLUJO_ETAPAS.md).

UPDATE Formulario_pregunta
SET fp_oculto_en_formulario = 1
WHERE fp_id = 1244; -- Manifestacion suscrita F-P3-07, v9

INSERT INTO Formulario_pregunta (
  fp_descripcion, fp_tipo, fp_estado, fp_orden, fp_created_at, fp_version,
  seccion_id, fp_requerida, formulario_id,
  fp_catalogo_tabla, fp_catalogo_columna, fp_catalogo_pk_column,
  fp_tipo_documento_id, fp_ancho_completo, fp_oculto_en_formulario
) VALUES (
  'F-P3-06 SOLICITUD DE VINCULACION COMERCIAL_REQUERIM Y SERVICIOS DEL CLIENTE REV 10',
  'DOCUMENTOS_TABLA', 1, 7, GETDATE(), 9,
  2007, 0, 1,
  'Tipos_documentos', 'tdo_nombre', 'tdo_id',
  24, 0, 1
);
