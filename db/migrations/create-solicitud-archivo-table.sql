-- Create Solicitud_archivo table if it doesn't exist
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Solicitud_archivo')
BEGIN
    CREATE TABLE Solicitud_archivo (
        sa_id INT IDENTITY(1,1) PRIMARY KEY,
        solicitud_id INT NOT NULL,
        fp_id INT NOT NULL,
        nombre_original NVARCHAR(255) NOT NULL,
        nombre_guardado NVARCHAR(255) NOT NULL,
        tamaño_bytes INT,
        tipo_mime NVARCHAR(100),
        ruta_almacenamiento NVARCHAR(MAX),
        cargado_por INT,
        estado NVARCHAR(50) DEFAULT 'activo',
        checksum_archivo NVARCHAR(64),
        created_at DATETIME DEFAULT GETDATE(),
        fecha_carga DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (solicitud_id) REFERENCES solicitudes(sol_id) ON DELETE CASCADE,
        FOREIGN KEY (fp_id) REFERENCES Formulario_pregunta(fp_id)
    );

    -- Create index for faster queries
    CREATE INDEX idx_solicitud_archivo_solicitud ON Solicitud_archivo(solicitud_id);
    CREATE INDEX idx_solicitud_archivo_estado ON Solicitud_archivo(estado);
END
