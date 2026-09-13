-- Elimina columnas de datos del cliente duplicadas en `solicitudes`:
-- sol_razon_social, sol_direccion, sol_telefono, sol_nit_documento.
-- Ver Documentos Cartonera/documentacion/Solicitudes/conceptos_iniciales.md.
--
-- Verificado en vivo (2026-09-12) que las 3 primeras están en NULL en TODAS
-- las solicitudes existentes, incluidas ya aprobadas: el dato real siempre
-- vivió en Formulario_respuesta (lo que declaró el cliente en el
-- formulario) o en Clientes (el dato vigente). sol_nit_documento sí se
-- llenaba, pero solo por respaldo desde Clientes.cli_nro_identificacion al
-- crear la solicitud, nunca desde el formulario. Sin índices ni FKs sobre
-- estas columnas.

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_razon_social')
    ALTER TABLE solicitudes DROP COLUMN sol_razon_social;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_direccion')
    ALTER TABLE solicitudes DROP COLUMN sol_direccion;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_telefono')
    ALTER TABLE solicitudes DROP COLUMN sol_telefono;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_nit_documento')
    ALTER TABLE solicitudes DROP COLUMN sol_nit_documento;
