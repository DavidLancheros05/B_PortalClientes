-- A pedido del usuario: en la sección "SOLICITUD DE CREDITO" (seccion_id=1010),
-- junto a "Tabla Referencia Comercial" (fp_id=2996, orden 4) y "Tabla
-- Referencia Bancaria" (fp_id=3001, orden 5), agrega 2 preguntas de
-- documento (ARCHIVO) sin condición (no dependen de ninguna otra
-- respuesta), para adjuntar el soporte de cada referencia.
--
-- Mismo patrón que 20260811_3 (clona Tipos_documentos y Formulario_pregunta
-- de una fila existente en vez de escribir todas las columnas a mano).

IF NOT EXISTS (SELECT 1 FROM Tipos_documentos WHERE tdo_nombre = 'Referencia Comercial')
BEGIN
  INSERT INTO Tipos_documentos
  (tdo_nombre, tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, tdo_created_at,
   tdo_descripcion, tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo)
  SELECT
   'Referencia Comercial', tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, GETDATE(),
   'Soporte de la referencia comercial diligenciada (documento adjuntado por el cliente)',
   tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo
  FROM Tipos_documentos WHERE tdo_id = 34;
END

IF NOT EXISTS (SELECT 1 FROM Tipos_documentos WHERE tdo_nombre = 'Referencia Bancaria')
BEGIN
  INSERT INTO Tipos_documentos
  (tdo_nombre, tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, tdo_created_at,
   tdo_descripcion, tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo)
  SELECT
   'Referencia Bancaria', tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, GETDATE(),
   'Soporte de la referencia bancaria diligenciada (documento adjuntado por el cliente)',
   tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo
  FROM Tipos_documentos WHERE tdo_id = 34;
END

DECLARE @tdoRefComercial INT = (SELECT tdo_id FROM Tipos_documentos WHERE tdo_nombre = 'Referencia Comercial');
DECLARE @tdoRefBancaria INT = (SELECT tdo_id FROM Tipos_documentos WHERE tdo_nombre = 'Referencia Bancaria');

IF NOT EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE seccion_id = 1010 AND fp_descripcion = 'Referencia Comercial' AND fp_tipo = 'ARCHIVO'
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
   'Referencia Comercial', 'ARCHIVO', fp_estado, 6, GETDATE(), fp_version, 1010,
   0, fp_minimo, NULL, fp_subtipo, fp_patron, fp_tabla_maestro,
   formulario_id, fp_opcion_disparadora, fp_descripcion_adicional,
   fp_validacion_adicional, NULL, NULL,
   fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
   @tdoRefComercial, fp_precarga_fuente, fp_precarga_campo_cliente,
   fp_catalogo_pk_column, NULL, fp_tabla_columnas, fp_ancho_columnas,
   fp_tabla_limite_modo, fp_tabla_limite_pregunta_id, fp_tabla_limite_reglas,
   fp_oculto_en_formulario, fp_catalogo_filtro_columna,
   fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_reglas,
   fp_catalogo_columna_condicion, fp_catalogo_valor_condicion
  FROM Formulario_pregunta WHERE fp_id = 3014;
END

IF NOT EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE seccion_id = 1010 AND fp_descripcion = 'Referencia Bancaria' AND fp_tipo = 'ARCHIVO'
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
   'Referencia Bancaria', 'ARCHIVO', fp_estado, 7, GETDATE(), fp_version, 1010,
   0, fp_minimo, NULL, fp_subtipo, fp_patron, fp_tabla_maestro,
   formulario_id, fp_opcion_disparadora, fp_descripcion_adicional,
   fp_validacion_adicional, NULL, NULL,
   fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
   @tdoRefBancaria, fp_precarga_fuente, fp_precarga_campo_cliente,
   fp_catalogo_pk_column, NULL, fp_tabla_columnas, fp_ancho_columnas,
   fp_tabla_limite_modo, fp_tabla_limite_pregunta_id, fp_tabla_limite_reglas,
   fp_oculto_en_formulario, fp_catalogo_filtro_columna,
   fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_reglas,
   fp_catalogo_columna_condicion, fp_catalogo_valor_condicion
  FROM Formulario_pregunta WHERE fp_id = 3014;
END
