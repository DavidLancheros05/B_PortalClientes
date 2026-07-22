-- "Activar versión" (Parametrización > Formularios > [id] > Versiones)
-- nunca funcionó: el código apuntaba a `formularios.formulario_version`,
-- una columna que nunca existió — la "versión activa" siempre se
-- calculaba al vuelo como MAX(fv_numero) en Formulario_versiones, sin
-- ningún mecanismo real para fijar una versión anterior como la vigente.
--
-- Se agrega la columna real que faltaba. NULL significa "sin fijar, usar
-- la más reciente" — mismo comportamiento de hoy para todo formulario
-- existente, no rompe nada retroactivamente.

IF COL_LENGTH('formularios', 'frm_version_activa') IS NULL
BEGIN
  ALTER TABLE formularios ADD frm_version_activa INT NULL;
END
