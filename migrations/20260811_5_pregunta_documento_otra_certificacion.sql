-- Mismo caso que 20260811_3 (Sistema Otro) pero para la sección de
-- Certificaciones: "¿Cual Certificación Tiene?" (fp_id=2965, MULTISELECT
-- con opciones OEA/BASC/ISO/Otra) — OEA/BASC/ISO disparan cada una su
-- pregunta ARCHIVO (3011-3013), pero "Otra" solo disparaba el campo de
-- texto "¿Cual otra Certificación?" (fp_id=2956), sin documento. Agrega el
-- documento faltante, con fp_maximo=5 (permite varios archivos, mismo
-- mecanismo que Sistema Otro).

IF NOT EXISTS (SELECT 1 FROM Tipos_documentos WHERE tdo_nombre = 'Certificado Otra')
BEGIN
  INSERT INTO Tipos_documentos
  (tdo_nombre, tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, tdo_created_at,
   tdo_descripcion, tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo)
  SELECT
   'Certificado Otra', tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, GETDATE(),
   'Soporte de la certificación adicional indicada por el cliente (puede adjuntar más de un documento)',
   tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo
  FROM Tipos_documentos WHERE tdo_id = 33;
END

DECLARE @nuevoTdoId INT = (SELECT tdo_id FROM Tipos_documentos WHERE tdo_nombre = 'Certificado Otra');

-- Corre el resto de la sección un puesto (fp_orden 7 en adelante, empezando
-- por la pregunta LAFT) para que "Certificado Otra" quede pegada a sus
-- hermanas OEA/BASC/ISO (orden 4-6) en vez de al final de la sección.
-- Guardado contra doble corrida: si la pregunta ya existe, no vuelve a correr.
IF NOT EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE fp_pregunta_padre_id = 2965 AND fp_valor_padre_disparador = 'Otra' AND fp_tipo = 'ARCHIVO'
)
BEGIN
  UPDATE Formulario_pregunta SET fp_orden = fp_orden + 1
  WHERE seccion_id = 2010 AND fp_estado = 1 AND fp_orden >= 7;
END

IF NOT EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE fp_pregunta_padre_id = 2965 AND fp_valor_padre_disparador = 'Otra' AND fp_tipo = 'ARCHIVO'
)
BEGIN
  INSERT INTO Formulario_pregunta
  (fp_descripcion, fp_tipo, fp_estado, fp_orden, fp_created_at, fp_version, seccion_id,
   fp_requerida, fp_minimo, fp_maximo, fp_subtipo, fp_patron, fp_tabla_maestro,
   formulario_id, fp_opcion_disparadora, fp_descripcion_adicional,
   fp_validacion_adicional, fp_pregunta_padre_id, fp_valor_padre_disparador,
   fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
   fp_tipo_documento_id, fp_precarga_fuente, fp_precarga_campo_cliente,
   fp_catalogo_pk_column, fp_codigo, fp_tabla_columnas, fp_ancho_columnas,
   fp_tabla_limite_modo, fp_tabla_limite_pregunta_id, fp_tabla_limite_reglas,
   fp_oculto_en_formulario, fp_catalogo_filtro_columna,
   fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_reglas,
   fp_catalogo_columna_condicion, fp_catalogo_valor_condicion)
  SELECT
   'Certificado Otra', fp_tipo, fp_estado, 7, GETDATE(), fp_version, seccion_id,
   fp_requerida, fp_minimo, 5, fp_subtipo, fp_patron, fp_tabla_maestro,
   formulario_id, fp_opcion_disparadora, fp_descripcion_adicional,
   fp_validacion_adicional, fp_pregunta_padre_id, 'Otra',
   fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
   @nuevoTdoId, fp_precarga_fuente, fp_precarga_campo_cliente,
   fp_catalogo_pk_column, NULL, fp_tabla_columnas, fp_ancho_columnas,
   fp_tabla_limite_modo, fp_tabla_limite_pregunta_id, fp_tabla_limite_reglas,
   fp_oculto_en_formulario, fp_catalogo_filtro_columna,
   fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_reglas,
   fp_catalogo_columna_condicion, fp_catalogo_valor_condicion
  FROM Formulario_pregunta WHERE fp_id = 3013;
END
