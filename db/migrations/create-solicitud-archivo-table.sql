-- Create Solicitud_archivo table if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Solicitud_archivo')
BEGIN
    CREATE TABLE Solicitud_archivo (
        sa_id INT IDENTITY(1,1) PRIMARY KEY,
        sa_sol_id INT NOT NULL,
        fp_id INT NOT NULL,
        sa_nombre_original NVARCHAR(255) NOT NULL,
        sa_nombre_guardado NVARCHAR(255) NOT NULL,
        sa_tamaño_bytes INT,
        sa_tipo_mime NVARCHAR(100),
        sa_ruta_almacenamiento NVARCHAR(MAX),
        sa_cargado_por INT,
        sa_estado NVARCHAR(50) DEFAULT 'activo',
        checksum_archivo NVARCHAR(64),
        created_at DATETIME DEFAULT GETDATE(),
        fecha_carga DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (sa_sol_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE,
        FOREIGN KEY (fp_id) REFERENCES Formulario_pregunta(fp_id)
    );

    -- Create index for faster queries
    CREATE INDEX idx_solicitud_archivo_solicitud ON Solicitud_archivo(sa_sol_id);
    CREATE INDEX idx_solicitud_archivo_estado ON Solicitud_archivo(estado);
END
