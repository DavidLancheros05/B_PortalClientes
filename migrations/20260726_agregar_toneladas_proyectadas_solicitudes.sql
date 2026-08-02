-- El Ejecutivo de Negocios debe registrar, junto al consumo mensual
-- proyectado (en COP, no USD pese a la etiqueta anterior), las toneladas
-- mensuales proyectadas del cliente. Se agrega la columna en solicitudes y,
-- igual que el consumo, una pregunta oculta en la sección interna "CONCEPTO
-- DEL EJECUTIVO DE NEGOCIOS" para que también quede reflejado en el PDF
-- completo de la solicitud.

IF COL_LENGTH('solicitudes', 'sol_toneladas_proyectadas') IS NULL
  ALTER TABLE solicitudes ADD sol_toneladas_proyectadas DECIMAL(18,2) NULL;

IF NOT EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE seccion_id = 2009 AND fp_version = 14
    AND fp_descripcion = 'Toneladas mes proyectado:'
)
INSERT INTO Formulario_pregunta (
  fp_descripcion, fp_tipo, fp_estado, fp_orden, fp_created_at,
  fp_version, seccion_id, fp_requerida, fp_subtipo, formulario_id,
  fp_ancho_completo, fp_oculto_en_formulario
) VALUES (
  'Toneladas mes proyectado:', 'NUMERO', 1, 4, GETDATE(),
  14, 2009, 1, NULL, 1,
  0, 0
);
