-- Materializa por cliente (cli_id, no sol_id) las secciones del formulario
-- que son preguntas tipo TABLA y hoy solo existen como JSON de texto en
-- Formulario_respuesta.fr_valor_texto (ver
-- "Documentos Cartonera/documentacion/Problemas serios/problemas.md").
-- Se pueblan al aprobar una solicitud (Comité de Crédito 2, mismo punto que
-- ya promueve Cliente_archivo), no en cada lectura — evita parsear el JSON
-- al vuelo para armar el envío a SIESA.
--
-- Todas comparten el mismo criterio:
--   * PK identity propia.
--   * FK a Clientes.cli_id — es la clave real (el histórico por solicitud
--     puntual lo sigue cubriendo Formulario_respuesta, que no se toca).
--   * *_sol_id nullable, solo trazabilidad ("de qué solicitud vino este
--     dato la última vez"), no se usa para consultar.
--   * *_created_at / *_updated_at.
--   * Se pueblan con DELETE + INSERT transaccional por cli_id en cada
--     aprobación (no hay clave natural estable entre versiones del
--     formulario para hacer upsert fila a fila).

-- ── cliente_direcciones_envio ───────────────────────────────────────────
-- Fuente: pregunta TABLA fp_codigo = 'AUTO_Q1231' ("Direcciones",
-- INFORMACION PARA DESPACHOS). Destino en SIESA: t215_mm_puntos_envio_cliente
-- (ver plan-migracion-clientes-siesa.md).
IF OBJECT_ID('dbo.cliente_direcciones_envio', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_direcciones_envio (
    cde_id INT IDENTITY(1,1) PRIMARY KEY,
    cde_cli_id INT NOT NULL,
    cde_pai_id INT NULL,
    cde_dpto_id INT NULL,
    cde_ciu_id INT NULL,
    cde_direccion NVARCHAR(255) NULL,
    cde_zona_franca BIT NOT NULL DEFAULT 0,
    cde_horario NVARCHAR(255) NULL,
    cde_sol_id INT NULL,
    cde_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    cde_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteDireccionesEnvio_Cliente FOREIGN KEY (cde_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteDireccionesEnvio_Pais FOREIGN KEY (cde_pai_id) REFERENCES dbo.Pais(pai_id),
    CONSTRAINT FK_ClienteDireccionesEnvio_Departamento FOREIGN KEY (cde_dpto_id) REFERENCES dbo.Departamentoes(dpto_id),
    CONSTRAINT FK_ClienteDireccionesEnvio_Ciudad FOREIGN KEY (cde_ciu_id) REFERENCES dbo.Ciudads(ciu_id),
    CONSTRAINT FK_ClienteDireccionesEnvio_Solicitud FOREIGN KEY (cde_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteDireccionesEnvio_Cliente ON dbo.cliente_direcciones_envio(cde_cli_id);
END

-- ── cliente_contactos_area ──────────────────────────────────────────────
-- Fuente: fp_codigo = 'AUTO_Q2651' ("Tabla de contactos", CONTACTOS -
-- Compras/Almacén/Calidad/Tesorería/Financiera). Destino en SIESA:
-- t2008_mm_otros_contactos_ter / t2013_mm_otros_contactos_cli.
IF OBJECT_ID('dbo.cliente_contactos_area', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_contactos_area (
    cca_id INT IDENTITY(1,1) PRIMARY KEY,
    cca_cli_id INT NOT NULL,
    cca_nombre NVARCHAR(255) NULL,
    cca_cargo NVARCHAR(150) NULL,
    cca_telefono VARCHAR(50) NULL,
    cca_correo VARCHAR(150) NULL,
    cca_sol_id INT NULL,
    cca_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    cca_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteContactosArea_Cliente FOREIGN KEY (cca_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteContactosArea_Solicitud FOREIGN KEY (cca_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteContactosArea_Cliente ON dbo.cliente_contactos_area(cca_cli_id);
END

-- ── cliente_contactos_facturacion_electronica ───────────────────────────
-- Fuente: fp_codigo = 'AUTO_Q2661' ("Tabla Facturación Electronica").
-- Mismo mecanismo SIESA que cliente_contactos_area (t2008/t2013), distinta
-- "clase de contacto" — tabla separada porque en el formulario son
-- secciones distintas (columnas también distintas: sin teléfono).
IF OBJECT_ID('dbo.cliente_contactos_facturacion_electronica', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_contactos_facturacion_electronica (
    cfe_id INT IDENTITY(1,1) PRIMARY KEY,
    cfe_cli_id INT NOT NULL,
    cfe_nombre NVARCHAR(255) NULL,
    cfe_cargo NVARCHAR(150) NULL,
    cfe_correo VARCHAR(150) NULL,
    cfe_sol_id INT NULL,
    cfe_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    cfe_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteContactosFacturacionElectronica_Cliente FOREIGN KEY (cfe_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteContactosFacturacionElectronica_Solicitud FOREIGN KEY (cfe_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteContactosFacturacionElectronica_Cliente ON dbo.cliente_contactos_facturacion_electronica(cfe_cli_id);
END

-- ── cliente_representantes_legales ──────────────────────────────────────
-- Fuente: fusiona fp_codigo = 'REP_LEGAL_TABLA' (principal) y
-- 'REP_LEGAL_SUPLENTES' (suplentes) — mismas 4 columnas en el formulario,
-- se distinguen con crl_tipo en vez de duplicar la tabla. Sin equivalente
-- en SIESA (KYC puro, plan-migracion-clientes-siesa.md), pero se normaliza
-- igual: "quién es hoy el representante legal de este cliente" es consulta
-- legítima por cli_id.
IF OBJECT_ID('dbo.cliente_representantes_legales', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_representantes_legales (
    crl_id INT IDENTITY(1,1) PRIMARY KEY,
    crl_cli_id INT NOT NULL,
    crl_tipo VARCHAR(20) NOT NULL, -- 'PRINCIPAL' | 'SUPLENTE'
    crl_nombre NVARCHAR(255) NULL,
    crl_identificacion VARCHAR(30) NULL,
    crl_ciu_expedicion_id INT NULL,
    crl_direccion NVARCHAR(255) NULL,
    crl_sol_id INT NULL,
    crl_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    crl_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT CK_ClienteRepresentantesLegales_Tipo CHECK (crl_tipo IN ('PRINCIPAL', 'SUPLENTE')),
    CONSTRAINT FK_ClienteRepresentantesLegales_Cliente FOREIGN KEY (crl_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteRepresentantesLegales_Ciudad FOREIGN KEY (crl_ciu_expedicion_id) REFERENCES dbo.Ciudads(ciu_id),
    CONSTRAINT FK_ClienteRepresentantesLegales_Solicitud FOREIGN KEY (crl_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteRepresentantesLegales_Cliente ON dbo.cliente_representantes_legales(crl_cli_id);
END

-- ── cliente_accionistas ─────────────────────────────────────────────────
-- Fuente: fp_codigo = 'AUTO_Q2659' ("Tabla relación de accionistas",
-- COMPOSICIÓN ACCIONARIA). Sin equivalente en SIESA — KYC/societario.
IF OBJECT_ID('dbo.cliente_accionistas', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_accionistas (
    cac_id INT IDENTITY(1,1) PRIMARY KEY,
    cac_cli_id INT NOT NULL,
    cac_nombre_razon_social NVARCHAR(255) NULL,
    cac_tid_id INT NULL,
    cac_no_identificacion VARCHAR(30) NULL,
    cac_porcentaje_participacion DECIMAL(5,2) NULL,
    cac_sol_id INT NULL,
    cac_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    cac_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteAccionistas_Cliente FOREIGN KEY (cac_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteAccionistas_TipoIdentificacion FOREIGN KEY (cac_tid_id) REFERENCES dbo.tipos_identificacion(tid_id),
    CONSTRAINT FK_ClienteAccionistas_Solicitud FOREIGN KEY (cac_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteAccionistas_Cliente ON dbo.cliente_accionistas(cac_cli_id);
END

-- ── cliente_beneficiarios_comex ─────────────────────────────────────────
-- Fuente: fp_codigo = 'AUTO_Q2671' ("Tabla personas o entidades
-- Beneficiarias de las operaciones de comercio exterior"). Sin equivalente
-- en SIESA — mismo patrón KYC que representante legal.
IF OBJECT_ID('dbo.cliente_beneficiarios_comex', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_beneficiarios_comex (
    cbc_id INT IDENTITY(1,1) PRIMARY KEY,
    cbc_cli_id INT NOT NULL,
    cbc_nombre NVARCHAR(255) NULL,
    cbc_identificacion VARCHAR(30) NULL,
    cbc_direccion NVARCHAR(255) NULL,
    cbc_sol_id INT NULL,
    cbc_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    cbc_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteBeneficiariosComex_Cliente FOREIGN KEY (cbc_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteBeneficiariosComex_Solicitud FOREIGN KEY (cbc_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteBeneficiariosComex_Cliente ON dbo.cliente_beneficiarios_comex(cbc_cli_id);
END

-- ── cliente_referencias_comerciales ──────────────────────────────────────
-- Fuente: fp_codigo = 'AUTO_Q2675' ("Tabla Referencia Comercial",
-- SOLICITUD DE CREDITO). Sin destino confirmado en SIESA todavía — se
-- normaliza igual por consistencia con el resto de secciones TABLA.
IF OBJECT_ID('dbo.cliente_referencias_comerciales', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_referencias_comerciales (
    crc_id INT IDENTITY(1,1) PRIMARY KEY,
    crc_cli_id INT NOT NULL,
    crc_nombre_contacto NVARCHAR(255) NULL,
    crc_telefono VARCHAR(50) NULL,
    crc_correo VARCHAR(150) NULL,
    crc_cupo_credito DECIMAL(18,2) NULL,
    crc_sol_id INT NULL,
    crc_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    crc_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteReferenciasComerciales_Cliente FOREIGN KEY (crc_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteReferenciasComerciales_Solicitud FOREIGN KEY (crc_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteReferenciasComerciales_Cliente ON dbo.cliente_referencias_comerciales(crc_cli_id);
END

-- ── cliente_referencias_bancarias ────────────────────────────────────────
-- Fuente: fp_codigo = 'AUTO_Q2676' ("Tabla Referencia Bancaria",
-- SOLICITUD DE CREDITO).
IF OBJECT_ID('dbo.cliente_referencias_bancarias', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.cliente_referencias_bancarias (
    crb_id INT IDENTITY(1,1) PRIMARY KEY,
    crb_cli_id INT NOT NULL,
    crb_nombre_banco NVARCHAR(255) NULL,
    crb_sucursal NVARCHAR(150) NULL,
    crb_cuenta_no VARCHAR(50) NULL,
    crb_telefono VARCHAR(50) NULL,
    crb_sol_id INT NULL,
    crb_created_at DATETIME NOT NULL DEFAULT GETDATE(),
    crb_updated_at DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_ClienteReferenciasBancarias_Cliente FOREIGN KEY (crb_cli_id) REFERENCES dbo.Clientes(cli_id) ON DELETE CASCADE,
    CONSTRAINT FK_ClienteReferenciasBancarias_Solicitud FOREIGN KEY (crb_sol_id) REFERENCES dbo.solicitudes(sol_id)
  );
  CREATE INDEX IX_ClienteReferenciasBancarias_Cliente ON dbo.cliente_referencias_bancarias(crb_cli_id);
END
