-- La pregunta "Estados GYP, y balance general..." (fp_tipo_documento_id=14)
-- quedó como fp_tipo='ARCHIVO' desde antes de que existiera DOCUMENTOS_TABLA
-- (el tipo pensado para documentos regulados con catálogo vinculado —
-- plantilla descargable, revisiones, regla de vigencia). Con catálogo
-- vinculado, ARCHIVO y DOCUMENTOS_TABLA ya se comportan/rendericen igual en
-- el frontend, así que se unifica a un solo camino de código.
--
-- Solo se toca fp_id=2831 (fp_version=14, la versión activa hoy —
-- formularios.frm_version_activa=14). Las filas de versiones anteriores
-- (fp_id 1243/2601/2632/2759, versiones 9/10/11/13) son historial usado
-- solo para regenerar el PDF de solicitudes ya presentadas — no se migran,
-- cambiarlas no aporta nada y agrega riesgo sobre datos ya presentados.

IF EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE fp_id = 2831 AND fp_tipo = 'ARCHIVO'
)
BEGIN
  UPDATE Formulario_pregunta
  SET fp_tipo = 'DOCUMENTOS_TABLA'
  WHERE fp_id = 2831;
END
