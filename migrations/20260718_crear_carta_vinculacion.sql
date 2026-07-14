CREATE TABLE Solicitud_carta_vinculacion (
  scv_id INT IDENTITY PRIMARY KEY,
  scv_sol_id INT NOT NULL,
  scv_nombre_original NVARCHAR(255) NOT NULL,
  scv_ruta_almacenamiento NVARCHAR(500) NOT NULL,
  scv_tipo_mime VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  scv_tamano_bytes INT NULL,
  scv_created_at DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT UQ_carta_vinculacion_sol UNIQUE (scv_sol_id)
);
