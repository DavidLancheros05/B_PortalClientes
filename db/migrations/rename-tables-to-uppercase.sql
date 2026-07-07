-- Renombrar tablas a mayúsculas
EXEC sp_rename 'solicitud_documento', 'Solicitud_documento';
EXEC sp_rename 'solicitud_archivo', 'Solicitud_archivo';
EXEC sp_rename 'formularios', 'Formularios';
EXEC sp_rename 'formulario_versiones', 'Formulario_versiones';
EXEC sp_rename 'formulario_secciones', 'Formulario_secciones';
EXEC sp_rename 'formulario_pregunta', 'Formulario_pregunta';
EXEC sp_rename 'formulario_pregunta_opcion', 'Formulario_pregunta_opcion';
EXEC sp_rename 'formulario_tipo_input', 'Formulario_tipo_input';
EXEC sp_rename 'formulario_respuesta', 'Formulario_respuesta';
EXEC sp_rename 'tipos_documentos', 'Tipos_documentos';

-- Verificar que las tablas fueron renombradas
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME IN ('Solicitud_documento', 'Solicitud_archivo', 'Formularios', 'Formulario_versiones',
                      'Formulario_secciones', 'Formulario_pregunta', 'Formulario_pregunta_opcion',
                      'Formulario_tipo_input', 'Formulario_respuesta', 'Tipos_documentos')
ORDER BY TABLE_NAME;
