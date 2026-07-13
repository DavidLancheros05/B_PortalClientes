CREATE TABLE Solicitud_soporte_analisis (
  ssa_id INT IDENTITY PRIMARY KEY,
  ssa_sol_id INT NOT NULL,
  ssa_wet_id INT NOT NULL,
  ssa_nombre_original NVARCHAR(255) NOT NULL,
  ssa_ruta_almacenamiento NVARCHAR(500) NOT NULL,
  ssa_tipo_mime NVARCHAR(100) NULL,
  ssa_tamano_bytes INT NULL,
  ssa_usuario_id INT NOT NULL,
  ssa_estado VARCHAR(20) NOT NULL DEFAULT 'activo',
  ssa_created_at DATETIME NOT NULL DEFAULT GETDATE()
);
