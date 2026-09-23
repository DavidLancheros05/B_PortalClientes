-- Elimina las columnas legacy de Formulario_versiones (fv_cambios,
-- fv_fecha_cambio, fv_usr_id_cambio), reemplazadas hace tiempo por
-- fv_descripcion, fv_created_at, fv_created_by. El codigo (formularios
-- .service.ts) ya no las lee ni las escribe. Verificado en vivo (DEV,
-- 2026-09-22): 0 de 13 filas tenian dato solo en la columna legacy, asi
-- que no hay perdida de informacion al borrarlas.
IF COL_LENGTH('Formulario_versiones', 'fv_cambios') IS NOT NULL
  ALTER TABLE Formulario_versiones DROP COLUMN fv_cambios;

IF COL_LENGTH('Formulario_versiones', 'fv_fecha_cambio') IS NOT NULL
  ALTER TABLE Formulario_versiones DROP COLUMN fv_fecha_cambio;

IF COL_LENGTH('Formulario_versiones', 'fv_usr_id_cambio') IS NOT NULL
  ALTER TABLE Formulario_versiones DROP COLUMN fv_usr_id_cambio;
