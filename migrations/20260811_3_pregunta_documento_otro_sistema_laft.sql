-- A pedido del usuario: en "¿Cual Sistema Tiene?" (fp_id=2976, MULTISELECT
-- con opciones SAGRILAFT/SARLAFT/SIPLAFT/SIPLA/Otro), la opción "Otro" solo
-- disparaba el campo de texto "¿Cual Sistema Adicional?" (fp_id=2978), a
-- diferencia de las otras 4 opciones que sí disparan cada una su propia
-- pregunta tipo ARCHIVO (3014-3017). Faltaba: (1) que "Otro" también pida
-- un documento soporte, y (2) que ese documento admita subir más de un
-- archivo (a diferencia de sus hermanas, que admiten solo uno).
--
-- Clona la fila de Tipos_documentos y de Formulario_pregunta de la
-- hermana "Sistema SAGRILAFT" (tdo_id=34 / fp_id=3014) en vez de escribir
-- todas las columnas a mano, para no arriesgar un desalineamiento de
-- columnas/valores en un INSERT largo.
--
-- fp_maximo=5 en una pregunta ARCHIVO es el mecanismo nuevo "permite varios
-- archivos" (ver 20260811_4_agregar_soporte_fp_maximo_multiple_archivo /
-- guardarRespuestaArchivo en el backend): NULL o 1 = un solo archivo
-- (comportamiento de siempre, todas las preguntas ARCHIVO existentes no se
-- ven afectadas), >1 = hasta esa cantidad de archivos.

-- Idempotente: no duplica si ya se corrió antes (ej. reintento tras el
-- primer intento, que falló en el segundo INSERT por fp_created_at NOT
-- NULL sin default, dejando ya creado el Tipos_documentos).
IF NOT EXISTS (SELECT 1 FROM Tipos_documentos WHERE tdo_nombre = 'Sistema Otro')
BEGIN
  INSERT INTO Tipos_documentos
  (tdo_nombre, tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, tdo_created_at,
   tdo_descripcion, tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo)
  SELECT
   'Sistema Otro', tdo_obligatorio, tdo_vigencia_dias, tdo_permite_vencimiento,
   tdo_aplica_cliente, tdo_aplica_zona_franca, tdo_estado, GETDATE(),
   'Soporte del sistema de prevención LA/FT adicional indicado por el cliente (puede adjuntar más de un documento)',
   tdo_regla_vigencia, tdo_anios_atras_permitidos,
   tdo_tiene_plantilla, tdo_plantilla_contenido, tdo_tipo_plantilla,
   tdo_origen, tdo_encabezado_tipo, tdo_pie_pagina_tipo
  FROM Tipos_documentos WHERE tdo_id = 34;
END

DECLARE @nuevoTdoId INT = (SELECT tdo_id FROM Tipos_documentos WHERE tdo_nombre = 'Sistema Otro');

IF NOT EXISTS (
  SELECT 1 FROM Formulario_pregunta
  WHERE fp_pregunta_padre_id = 2976 AND fp_valor_padre_disparador = 'Otro' AND fp_tipo = 'ARCHIVO'
)
BEGIN
  INSERT INTO Formulario_pregunta
  (fp_descripcion, fp_tipo, fp_estado, fp_orden, fp_created_at, fp_version, seccion_id,
   fp_requerida, fp_minimo, fp_maximo, fp_subtipo, fp_patron, fp_tabla_maestro,
   formulario_id, fp_opcion_disparadora, fp_descripcion_adicional,
   fp_validacion_adicional, fp_pregunta_padre_id, fp_valor_padre_disparador,
   fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
   fp_tipo_documento_id, fp_precarga_fuente, fp_precarga_campo_cliente,
   fp_catalogo_pk_column, fp_codigo, fp_tabla_columnas, fp_ancho_completo,
   fp_tabla_limite_modo, fp_tabla_limite_pregunta_id, fp_tabla_limite_reglas,
   fp_oculto_en_formulario, fp_catalogo_filtro_columna,
   fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_reglas,
   fp_catalogo_columna_condicion, fp_catalogo_valor_condicion)
  SELECT
   'Sistema Otro', fp_tipo, fp_estado, 14, GETDATE(), fp_version, seccion_id,
   fp_requerida, fp_minimo, 5, fp_subtipo, fp_patron, fp_tabla_maestro,
   formulario_id, fp_opcion_disparadora, fp_descripcion_adicional,
   fp_validacion_adicional, fp_pregunta_padre_id, 'Otro',
   fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
   @nuevoTdoId, fp_precarga_fuente, fp_precarga_campo_cliente,
   fp_catalogo_pk_column, NULL, fp_tabla_columnas, fp_ancho_completo,
   fp_tabla_limite_modo, fp_tabla_limite_pregunta_id, fp_tabla_limite_reglas,
   fp_oculto_en_formulario, fp_catalogo_filtro_columna,
   fp_catalogo_filtro_pregunta_id, fp_catalogo_filtro_reglas,
   fp_catalogo_columna_condicion, fp_catalogo_valor_condicion
  FROM Formulario_pregunta WHERE fp_id = 3014;
END
