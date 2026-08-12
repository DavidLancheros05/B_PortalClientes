-- Solución de fondo: 3 lugares del backend resolvían preguntas de las
-- secciones ocultas al cliente (CONCEPTO DEL EJECUTIVO DE NEGOCIOS,
-- USO EXCLUSIVO DE CARTONERA NACIONAL S.A., y la tabla de accionistas de
-- COMPOSICIÓN ACCIONARIA) por `fs_nombre LIKE '...'` + `fp_descripcion`, en
-- vez de por `fp_codigo` (el mecanismo ya usado para TIPO_SOLICITUD,
-- SOLICITA_CREDITO, CUPO_SOLICITADO, REP_LEGAL_TABLA, REP_LEGAL_SUPLENTES —
-- ver 20260727_backfill_fp_codigo_identidad_entre_versiones.sql). Si alguien
-- renombraba la sección o el texto de la pregunta desde la pantalla de
-- parametrización, esas 3 queries dejaban de encontrar las preguntas sin
-- ningún aviso visible (solo un console.warn en el backend).
--
-- Estas preguntas ya tenían fp_codigo, pero auto-generado y no descriptivo
-- (AUTO_Q<fp_id>, y para accionistas ni siquiera estable: AUTO_Q1216 en
-- versiones viejas, AUTO_Q2659 en las nuevas, porque el agrupamiento del
-- backfill usa fp_descripcion y esa descripción cambió entre versiones).
-- Esta migración les asigna un código fijo y descriptivo, igual para todas
-- las versiones del formulario.
--
-- Segura de re-ejecutar (UPDATE idempotente por valor).

-- Sección 2009 "CONCEPTO DEL EJECUTIVO DE NEGOCIOS"
UPDATE Formulario_pregunta SET fp_codigo = 'CONCEPTO_EJECUTIVO_NOMBRE'
WHERE seccion_id = 2009 AND fp_descripcion = 'Ejecutivo de negocios:' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'CONCEPTO_OBSERVACIONES'
WHERE seccion_id = 2009 AND fp_descripcion = 'Observaciones adicionales:' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'CONCEPTO_CONSUMO_PROYECTADO'
WHERE seccion_id = 2009 AND fp_descripcion = 'Consumo mes proyectado:' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'CONCEPTO_TONELADAS_PROYECTADO'
WHERE seccion_id = 2009 AND fp_descripcion = 'Toneladas mes proyectado:' AND fp_estado = 1;

-- Sección 2008 "USO EXCLUSIVO DE CARTONERA NACIONAL S.A."
UPDATE Formulario_pregunta SET fp_codigo = 'USO_EXCL_DECISION'
WHERE seccion_id = 2008 AND fp_descripcion = 'DECISION' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'USO_EXCL_CUPO'
WHERE seccion_id = 2008 AND fp_descripcion = 'Cupo$' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'USO_EXCL_PLAZO_PAGO'
WHERE seccion_id = 2008 AND fp_descripcion = 'Plazo de Pago' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'USO_EXCL_FORMA_PAGO'
WHERE seccion_id = 2008 AND fp_descripcion = 'Forma de pago' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'USO_EXCL_APRUEBA_NOMBRE'
WHERE seccion_id = 2008 AND fp_descripcion = 'Nombre de quien aprueba' AND fp_estado = 1;

UPDATE Formulario_pregunta SET fp_codigo = 'USO_EXCL_FIRMA'
WHERE seccion_id = 2008 AND fp_descripcion = 'Firma:' AND fp_estado = 1;

-- Sección 1008 "COMPOSICIÓN ACCIONARIA (RELACIÓN DE ACCIONISTAS)" — mismo
-- código para las dos variantes de descripción que tuvo la pregunta tabla
-- a través de versiones.
UPDATE Formulario_pregunta SET fp_codigo = 'ACCIONISTAS_TABLA'
WHERE seccion_id = 1008 AND fp_tipo = 'TABLA' AND fp_estado = 1
  AND fp_descripcion IN (
    'COMPOSICIÓN ACCIONARIA (RELACIÓN DE ACCIONISTAS)',
    'Tabla relación de accionistas'
  );
