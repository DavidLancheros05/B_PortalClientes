-- FK_ClienteArchivo_SolicitudArchivo (creada en 20260802_crear_cliente_archivo.sql)
-- quedó con ON DELETE NO ACTION (default), y nunca se incluyó en
-- 20260722_fk_cascade_tablas_hijas_solicitudes.sql (esa migración es
-- anterior a que Cliente_archivo existiera). Resultado: al borrar una
-- solicitud, el CASCADE hacia Solicitud_archivo choca con esta FK apenas esa
-- solicitud tiene algún documento ya promovido al archivo consolidado del
-- cliente ("The DELETE statement conflicted with the REFERENCE constraint
-- 'FK_ClienteArchivo_SolicitudArchivo'...").
--
-- La solución NO es CASCADE: Cliente_archivo.ca_sa_id es solo trazabilidad
-- de "de qué Solicitud_archivo vino" (columna nullable, ver comentario en
-- 20260802_crear_cliente_archivo.sql). El documento del cliente es un asset
-- propio y duplicado a propósito (ClienteArchivoService.promoverDocumentos)
-- para que borrar/reemplazar el original en la solicitud NO se lleve el
-- archivo consolidado del cliente. Por eso el fix correcto es SET NULL:
-- se pierde el dato de qué solicitud lo originó, pero el documento del
-- cliente sigue intacto.

IF EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_ClienteArchivo_SolicitudArchivo'
)
BEGIN
  ALTER TABLE Cliente_archivo
  DROP CONSTRAINT FK_ClienteArchivo_SolicitudArchivo;
END

ALTER TABLE Cliente_archivo
ADD CONSTRAINT FK_ClienteArchivo_SolicitudArchivo
FOREIGN KEY (ca_sa_id) REFERENCES Solicitud_archivo(sa_id) ON DELETE SET NULL;
