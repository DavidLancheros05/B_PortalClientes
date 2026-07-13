-- Limpieza de plantillas de notificaciones por correo.
--
-- 1) `param_notificaciones_templates` es una tabla huérfana: ningún archivo
--    del backend la referencia (la tabla real es `Param_formato_correos_enviar`,
--    creada/sembrada desde notificaciones.service.ts::ensurePlantillasTable()).
--    Sus filas son un subconjunto exacto de las de `Param_formato_correos_enviar`
--    (mismos codigo_evento, sin destinatarios_to/cc configurados), así que no
--    se pierde ninguna configuración real al borrarla.
IF OBJECT_ID('dbo.param_notificaciones_templates', 'U') IS NOT NULL
BEGIN
  DROP TABLE dbo.param_notificaciones_templates;
END

-- 2) La plantilla SOLICITUD_REGISTRADA_COMERCIAL quedó sembrada en
--    Param_formato_correos_enviar pero el rol COMERCIAL no tiene ningún
--    usuario activo asignado hoy, y se decidió eliminar ese aviso genérico
--    (el Ejecutivo de Negocios ya recibe su propio correo al registrarse la
--    solicitud). Se quita también la llamada en notificaciones.service.ts.
IF OBJECT_ID('dbo.Param_formato_correos_enviar', 'U') IS NOT NULL
BEGIN
  DELETE FROM dbo.Param_formato_correos_enviar
  WHERE codigo_evento = 'SOLICITUD_REGISTRADA_COMERCIAL';
END
