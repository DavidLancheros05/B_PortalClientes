-- Cliente_archivo necesita su propio public_id/resource_type de Cloudinary,
-- igual que ya tiene Solicitud_archivo (sa_cloudinary_public_id/sa_resource_type)
-- — sin esto, ClienteArchivoService.promoverDocumentos solo podía copiar la
-- URL del archivo original, dejando el "archivo maestro" del cliente
-- apuntando al mismo asset físico que la solicitud aprobada: si alguien
-- reemplazaba/eliminaba ese documento ahí, storageService.destroy() lo
-- borraba de Cloudinary y rompía también el archivo consolidado del cliente
-- (y cualquier Ampliación de Cupo que lo hubiera clonado desde ahí).
-- Ver documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md
-- ("Gap encontrado 2026-08-02") y documentacion/flujo-ampliacion-de-cupo.md
-- (corrección (18): duplicación real en vez de compartir URL).
--
-- Mismos tamaños que Solicitud_archivo.sa_cloudinary_public_id/sa_resource_type.
IF COL_LENGTH('Cliente_archivo', 'ca_cloudinary_public_id') IS NULL
  ALTER TABLE Cliente_archivo ADD ca_cloudinary_public_id NVARCHAR(255) NULL;

IF COL_LENGTH('Cliente_archivo', 'ca_resource_type') IS NULL
  ALTER TABLE Cliente_archivo ADD ca_resource_type NVARCHAR(20) NULL;

-- Sin backfill: las filas existentes (promovidas antes de este fix) se
-- quedan con estas dos columnas en NULL, y siguen sirviendo el documento
-- por sa_ruta_almacenamiento directo (mismo fallback que ya usa
-- obtenerRespuestaArchivo cuando no hay public_id) — comparten asset físico
-- con la solicitud original hasta que alguien las vuelva a promover.
