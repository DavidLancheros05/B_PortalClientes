-- Cliente_archivo: "documentos definitivos" del cliente — un único registro
-- vigente por (cliente, tipo de documento), reutilizable entre solicitudes
-- futuras en vez de volver a pedir el mismo documento cada vez.
-- Ver documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md
-- (secciones 1-3).
--
-- Se promueve automáticamente al aprobar una solicitud en Comité de Crédito
-- 2 (guardarConceptoGenerico, solicitudes-workflow.service.ts) — nunca antes,
-- porque "cliente" solo existe como tal una vez aprobado ahí.

-- Tipos_documentos.tdo_id es IDENTITY pero nunca tuvo PRIMARY KEY ni UNIQUE
-- (mismo caso que solicitudes.sol_id antes de la migración
-- 20260722_fk_cascade_tablas_hijas_solicitudes.sql) — sin eso, ninguna FK
-- puede referenciarlo. Confirmado sin duplicados/nulos antes de esta
-- migración (14 filas, 14 tdo_id distintos).
IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE type = 'PK' AND parent_object_id = OBJECT_ID('Tipos_documentos')
)
BEGIN
  ALTER TABLE Tipos_documentos
  ADD CONSTRAINT PK_TiposDocumentos PRIMARY KEY (tdo_id);
END

IF OBJECT_ID('dbo.Cliente_archivo', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Cliente_archivo (
    ca_id INT IDENTITY(1,1) PRIMARY KEY,
    ca_cli_id INT NOT NULL,
    ca_tdo_id INT NOT NULL,
    ca_sa_id BIGINT NULL, -- de qué Solicitud_archivo vino (sa_id es bigint)
    ca_nombre_original NVARCHAR(255) NOT NULL,
    ca_ruta_almacenamiento NVARCHAR(500) NOT NULL,
    ca_tipo_mime NVARCHAR(100) NULL,
    ca_fecha_emision DATE NULL,
    ca_fecha_vencimiento DATE NULL,
    ca_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT UQ_cliente_archivo_cli_tdo UNIQUE (ca_cli_id, ca_tdo_id),
    CONSTRAINT FK_ClienteArchivo_Cliente FOREIGN KEY (ca_cli_id) REFERENCES clientes(cli_id),
    CONSTRAINT FK_ClienteArchivo_TipoDocumento FOREIGN KEY (ca_tdo_id) REFERENCES Tipos_documentos(tdo_id),
    CONSTRAINT FK_ClienteArchivo_SolicitudArchivo FOREIGN KEY (ca_sa_id) REFERENCES Solicitud_archivo(sa_id)
  );
END

-- Backfill: sin esto, la tabla arranca vacía y verificarDocumentosVencidos
-- (ampliacion-cupo.service.ts, que pasa a consultar Cliente_archivo en vez
-- de Solicitud_archivo) interpretaría "cero filas vencidas" como "todo
-- vigente" para CUALQUIER cliente ya aprobado antes de este cambio — el
-- código nuevo trata "cliente sin ninguna fila en Cliente_archivo" como
-- "vencido" (conservador) precisamente para no depender de este backfill,
-- pero igual conviene dejar poblada la tabla desde ya con el mismo criterio
-- que usará la promoción automática hacia adelante (última solicitud
-- aprobada del cliente, documentos activos y sin sa_requiere_cambio).
;WITH UltimaAprobadaPorCliente AS (
  SELECT sol_id, sol_cliente_id,
         ROW_NUMBER() OVER (PARTITION BY sol_cliente_id ORDER BY sol_id DESC) AS rn
  FROM solicitudes
  WHERE sol_estado_id = 5 -- APROBADA (solicitud_estados)
),
DocumentosAPromover AS (
  SELECT
    u.sol_cliente_id AS ca_cli_id,
    fp.fp_tipo_documento_id AS ca_tdo_id,
    sa.sa_id AS ca_sa_id,
    sa.sa_nombre_original AS ca_nombre_original,
    sa.sa_ruta_almacenamiento AS ca_ruta_almacenamiento,
    sa.sa_tipo_mime AS ca_tipo_mime,
    sa.sa_fecha_emision AS ca_fecha_emision,
    sa.sa_fecha_vencimiento AS ca_fecha_vencimiento,
    ROW_NUMBER() OVER (
      PARTITION BY u.sol_cliente_id, fp.fp_tipo_documento_id
      ORDER BY sa.sa_id DESC
    ) AS rn2
  FROM UltimaAprobadaPorCliente u
  JOIN Solicitud_archivo sa ON sa.sa_sol_id = u.sol_id
  JOIN Formulario_pregunta fp ON fp.fp_id = sa.sa_fp_id
  WHERE u.rn = 1
    AND sa.sa_estado = 'activo'
    AND ISNULL(sa.sa_requiere_cambio, 0) = 0
    AND fp.fp_tipo_documento_id IS NOT NULL
)
INSERT INTO dbo.Cliente_archivo
  (ca_cli_id, ca_tdo_id, ca_sa_id, ca_nombre_original, ca_ruta_almacenamiento,
   ca_tipo_mime, ca_fecha_emision, ca_fecha_vencimiento)
SELECT
  d.ca_cli_id, d.ca_tdo_id, d.ca_sa_id, d.ca_nombre_original, d.ca_ruta_almacenamiento,
  d.ca_tipo_mime, d.ca_fecha_emision, d.ca_fecha_vencimiento
FROM DocumentosAPromover d
WHERE d.rn2 = 1
  AND NOT EXISTS (
    SELECT 1 FROM dbo.Cliente_archivo ca
    WHERE ca.ca_cli_id = d.ca_cli_id AND ca.ca_tdo_id = d.ca_tdo_id
  );
