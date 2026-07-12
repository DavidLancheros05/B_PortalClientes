-- Migración: Columnas Cloudinary en Solicitud_archivo
-- Fecha: 2026-07-14
-- Descripción: Los documentos migran de almacenamiento en disco local
--              (efímero en Render) a Cloudinary. sa_ruta_almacenamiento se
--              reutiliza para guardar la secure_url de Cloudinary (mismo
--              nombre/tipo, ningún SELECT existente cambia). Se agregan
--              sa_cloudinary_public_id y sa_resource_type porque la API de
--              Cloudinary los exige para poder borrar un archivo o generar
--              su URL de descarga.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Solicitud_archivo' AND COLUMN_NAME = 'sa_cloudinary_public_id'
)
BEGIN
    ALTER TABLE Solicitud_archivo
    ADD sa_cloudinary_public_id NVARCHAR(255) NULL;
    PRINT 'Columna sa_cloudinary_public_id agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sa_cloudinary_public_id ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Solicitud_archivo' AND COLUMN_NAME = 'sa_resource_type'
)
BEGIN
    ALTER TABLE Solicitud_archivo
    ADD sa_resource_type NVARCHAR(20) NULL;
    PRINT 'Columna sa_resource_type agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna sa_resource_type ya existe';
END;

-- Verificación
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Solicitud_archivo'
  AND COLUMN_NAME IN ('sa_cloudinary_public_id', 'sa_resource_type');
