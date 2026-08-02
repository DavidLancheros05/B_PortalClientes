-- Continúa el trabajo de 20260722_fk_cascade_tablas_hijas_solicitudes.sql:
-- agrega las FK que ese script no cubrió (columnas que apuntan a catálogos/
-- usuarios, no a `solicitudes` misma) y limpia los UNIQUE duplicados
-- detectados en documentacion/diagnostico-llaves-y-fk-solicitudes-workflow.md.
--
-- Todas las FK nuevas van con ON DELETE NO ACTION (a diferencia de las de
-- 20260722): estas SÍ son relaciones "hijo -> catálogo/usuario", borrar un
-- cliente/usuario/catálogo NO debe arrastrar solicitudes ni historial.

-- 1) Hallazgo nuevo: sol_usuario_crea / swh_usuario_id / seh_usr_id ---------
-- Debían ser NULL cuando el creador es el cliente (ver comentario en
-- solicitudes.service.ts: "Usuario (puede ser NULL si es un cliente)"), pero
-- las 3 solicitudes que un cliente creó desde el portal (cli_id 13603, 13605,
-- 13606 — clientes de prueba) terminaron con el cli_id guardado en estas
-- columnas de "usuario" en vez de NULL/un usr_id real.
--
-- `sol_usuario_crea` sí es nullable, así que aquí se limpia y más abajo se
-- le agrega la FK. `swh_usuario_id` y `seh_usr_id` son NOT NULL (se
-- confirmó al intentar este mismo UPDATE sobre ellas: "Cannot insert the
-- value NULL... column does not allow nulls") — no se pueden limpiar así,
-- y por lo tanto tampoco se les agrega FK en esta migración. Requiere una
-- decisión de producto (¿un usuario "Cliente (autoservicio)" sentinel?
-- ¿permitir NULL en la columna?) antes de poder resolverlas — queda
-- pendiente y documentado en el diagnóstico.
UPDATE solicitudes
SET sol_usuario_crea = NULL
WHERE sol_usuario_crea IN (13603, 13605, 13606)
  AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.usr_id = solicitudes.sol_usuario_crea);

-- 2) FK faltantes en `solicitudes` -----------------------------------------

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_cliente')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_cliente
  FOREIGN KEY (sol_cliente_id) REFERENCES Clientes(cli_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_centro_operacion')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_centro_operacion
  FOREIGN KEY (sol_co_id) REFERENCES Centro_operacion(cop_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_motivo_rechazo')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_motivo_rechazo
  FOREIGN KEY (sol_motivo_rechazo_id) REFERENCES Motivos_rechazo_solicitud(mrs_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_usuario_crea')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_usuario_crea
  FOREIGN KEY (sol_usuario_crea) REFERENCES usuarios(usr_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_usuario_modifica')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_usuario_modifica
  FOREIGN KEY (sol_usuario_modifica) REFERENCES usuarios(usr_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_usuario_aprueba_condiciones')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_usuario_aprueba_condiciones
  FOREIGN KEY (sol_usuario_aprueba_condiciones) REFERENCES usuarios(usr_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_usuario_gestion_rechazo')
BEGIN
  ALTER TABLE solicitudes
  ADD CONSTRAINT FK_solicitudes_usuario_gestion_rechazo
  FOREIGN KEY (sol_usuario_gestion_rechazo) REFERENCES usuarios(usr_id);
END

-- 3) FK faltantes en tablas hijas -------------------------------------------

-- Hallazgo nuevo (no estaba en el diagnóstico original, salió al intentar
-- crear la FK de abajo): `Formulario_pregunta` es HEAP, sin PK/UNIQUE en
-- fp_id (igual que le pasaba a `solicitudes.sol_id` antes de 20260722) — sin
-- eso SQL Server no permite usarla como tabla referenciada. Confirmado sin
-- nulos/duplicados (561/561) antes de agregarla.
IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE type = 'PK' AND parent_object_id = OBJECT_ID('Formulario_pregunta')
)
BEGIN
  ALTER TABLE Formulario_pregunta
  ADD CONSTRAINT PK_Formulario_pregunta PRIMARY KEY (fp_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudArchivo_FormularioPregunta')
BEGIN
  ALTER TABLE Solicitud_archivo
  ADD CONSTRAINT FK_SolicitudArchivo_FormularioPregunta
  FOREIGN KEY (sa_fp_id) REFERENCES Formulario_pregunta(fp_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudSoporteAnalisis_WorkflowEtapa')
BEGIN
  ALTER TABLE Solicitud_soporte_analisis
  ADD CONSTRAINT FK_SolicitudSoporteAnalisis_WorkflowEtapa
  FOREIGN KEY (ssa_wet_id) REFERENCES workflow_etapas(wet_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudWorkflowHistorial_Etapa')
BEGIN
  ALTER TABLE solicitud_workflow_historial
  ADD CONSTRAINT FK_SolicitudWorkflowHistorial_Etapa
  FOREIGN KEY (swh_etapa_id) REFERENCES workflow_etapas(wet_id);
END

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudWorkflowHistorial_Resultado')
BEGIN
  ALTER TABLE solicitud_workflow_historial
  ADD CONSTRAINT FK_SolicitudWorkflowHistorial_Resultado
  FOREIGN KEY (swh_resultado_id) REFERENCES workflow_estado_etapa(wee_id);
END

-- FK_SolicitudWorkflowHistorial_Usuario (swh_usuario_id -> usuarios) queda
-- fuera a propósito: la columna es NOT NULL y 6 filas de prueba tienen un
-- cli_id guardado ahí en vez de un usr_id real — ver nota al inicio del
-- archivo.

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudesEstadosHist_Estado')
BEGIN
  ALTER TABLE Solicitudes_estados_hist
  ADD CONSTRAINT FK_SolicitudesEstadosHist_Estado
  FOREIGN KEY (seh_estado_id) REFERENCES solicitud_estados(ses_id);
END

-- FK_SolicitudesEstadosHist_Usuario (seh_usr_id -> usuarios) queda fuera por
-- la misma razón: NOT NULL + 6 filas de prueba con cli_id en vez de usr_id.

-- 4) Limpiar UNIQUE duplicados (mismos nombres confirmados en vivo el
-- 2026-08-02 contra sys.key_constraints; se dejan los nombres descriptivos y
-- se elimina el autogenerado en cada caso) ----------------------------------

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ__solicitu__A10669E623BC654B')
BEGIN
  ALTER TABLE solicitud_estados DROP CONSTRAINT [UQ__solicitu__A10669E623BC654B];
END

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ__workflow__AD76C47360006CEE')
BEGIN
  ALTER TABLE workflow_etapas DROP CONSTRAINT [UQ__workflow__AD76C47360006CEE];
END

-- En workflow_estado_etapa ninguno de los dos nombres es descriptivo del
-- todo (UQ_workflow_resultados_codigo no coincide con el nombre de la
-- tabla) — se elimina el autogenerado y se renombra el otro al patrón usado
-- en las demás tablas de este bloque.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ__workflow__079956AD7889032C')
BEGIN
  ALTER TABLE workflow_estado_etapa DROP CONSTRAINT [UQ__workflow__079956AD7889032C];
END

IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_workflow_resultados_codigo')
  AND NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_workflow_estado_etapa_codigo')
BEGIN
  -- Constraints son objetos con alcance de esquema, no de tabla: a
  -- diferencia de renombrar una columna/índice, NO se califica con
  -- "tabla.nombre" (eso causaba "el parámetro @objname es ambiguo").
  EXEC sp_rename N'UQ_workflow_resultados_codigo', N'UQ_workflow_estado_etapa_codigo', N'OBJECT';
END
