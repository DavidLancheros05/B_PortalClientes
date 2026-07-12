-- Script para corregir el índice único de Solicitud_archivo
-- El índice debe ser único por solicitud, no globalmente

-- 1. Eliminar el índice único actual
IF OBJECT_ID('uq_Solicitud_archivo_checksum', 'UQ') IS NOT NULL
BEGIN
    ALTER TABLE dbo.Solicitud_archivo DROP CONSTRAINT uq_Solicitud_archivo_checksum;
    PRINT 'Índice uq_Solicitud_archivo_checksum eliminado';
END;

-- 2. Crear nuevo índice único compuesto (sa_sol_id, checksum_archivo)
ALTER TABLE dbo.Solicitud_archivo ADD CONSTRAINT uq_Solicitud_archivo_checksum
UNIQUE (sa_sol_id, checksum_archivo);

PRINT 'Índice único (sa_sol_id, checksum_archivo) creado correctamente';
PRINT 'Ahora cada solicitud puede tener solo un archivo con el mismo contenido (checksum)';
PRINT 'Pero el mismo archivo puede subirse en diferentes solicitudes';
