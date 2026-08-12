-- Evidencia (un archivo, reemplazable) por fila de una pregunta tipo TABLA
-- (representante legal principal, suplentes, composición accionaria) en la
-- pantalla de Gestión Oficial de Cumplimiento. sep_fila_index es la
-- posición de la persona dentro de las filas de esa pregunta para esta
-- solicitud puntual.
IF OBJECT_ID('Solicitud_evidencia_persona') IS NULL
BEGIN
  CREATE TABLE Solicitud_evidencia_persona (
    sep_id INT IDENTITY PRIMARY KEY,
    sep_sol_id INT NOT NULL,
    sep_fp_id INT NOT NULL,
    sep_fila_index INT NOT NULL,
    sep_nombre_original NVARCHAR(255) NOT NULL,
    sep_ruta_almacenamiento NVARCHAR(500) NOT NULL,
    sep_tipo_mime NVARCHAR(100) NULL,
    sep_tamano_bytes INT NULL,
    sep_usuario_id INT NOT NULL,
    sep_estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    sep_created_at DATETIME NOT NULL DEFAULT GETDATE()
  );
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudEvidenciaPersona_Solicitud'
)
BEGIN
  ALTER TABLE Solicitud_evidencia_persona
  ADD CONSTRAINT FK_SolicitudEvidenciaPersona_Solicitud
  FOREIGN KEY (sep_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE;
END

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_SolicitudEvidenciaPersona_FormularioPregunta'
)
BEGIN
  ALTER TABLE Solicitud_evidencia_persona
  ADD CONSTRAINT FK_SolicitudEvidenciaPersona_FormularioPregunta
  FOREIGN KEY (sep_fp_id) REFERENCES Formulario_pregunta(fp_id);
END
