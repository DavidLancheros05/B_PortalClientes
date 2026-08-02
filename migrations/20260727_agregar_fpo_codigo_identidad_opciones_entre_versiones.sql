-- Paso 1/2 de este fix — ver
-- 20260727_backfill_fpo_codigo_identidad_opciones_entre_versiones.sql para
-- el backfill (columna y backfill van en archivos separados porque SQL
-- Server exige que un ALTER TABLE y el uso de la columna nueva estén en
-- batches distintos — no hay soporte de GO en el runner de migraciones de
-- este proyecto, db-query.mjs ejecuta el archivo completo como un solo
-- batch).
--
-- Continuación del fix de precarga entre versiones (ver
-- 20260727_backfill_fp_codigo_identidad_entre_versiones.sql y
-- documentacion/flujo-ampliacion-de-cupo.md, "Corrección 2026-07-27 (5)").
-- Las opciones de una pregunta SELECT/MULTISELECT tienen el mismo problema
-- que las preguntas: fpo_id es IDENTITY y cambia en cada clonado de
-- versión. Confirmado en vivo: la opción "Ampliacion de cupo" de
-- TIPO_SOLICITUD es fpo_id=11519 en la v13 y fpo_id=11595 en la v14.
--
-- Segura de re-ejecutar: el ALTER es condicional.

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Formulario_pregunta_opcion' AND COLUMN_NAME = 'fpo_codigo'
)
BEGIN
  ALTER TABLE Formulario_pregunta_opcion ADD fpo_codigo NVARCHAR(100) NULL;
END
