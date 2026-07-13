-- Nuevo tipo de pregunta: espacio en blanco parametrizable para firma manual
INSERT INTO Formulario_tipo_input (fti_codigo, fti_descripcion, fti_estado)
VALUES ('ESPACIO_FIRMA', 'Espacio en blanco para firma manual (líneas configurables)', 1);

-- Ocultar la sección ACUERDO del formulario de crear/editar (sigue visible en el PDF)
UPDATE Formulario_secciones SET fs_oculta_en_formulario = 1 WHERE fs_id = 2007;

-- Firma y sello dejan de ser IMAGEN (subida de archivo) y pasan a espacio en blanco
UPDATE Formulario_pregunta
SET fp_tipo = 'ESPACIO_FIRMA', fp_maximo = 5, fp_oculto_en_formulario = 1
WHERE fp_id IN (2239, 2240);
