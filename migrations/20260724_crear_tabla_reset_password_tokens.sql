-- Migration: tabla para el flujo de "Olvidé mi contraseña" (no existía
-- ningún mecanismo self-service, solo reseteo manual por un admin). El
-- token nunca se guarda en texto plano (mismo criterio que las
-- contraseñas, ver hallazgo #1 de autenticacion-y-seguridad-sesion.md):
-- se guarda su hash SHA-256; el valor real solo viaja una vez, por
-- correo, en el link.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'param_reset_password_tokens')
BEGIN
    CREATE TABLE dbo.param_reset_password_tokens (
        rpt_id INT IDENTITY(1,1) PRIMARY KEY,
        rpt_tipo VARCHAR(10) NOT NULL,      -- 'cliente' | 'usuario'
        rpt_usr_id INT NOT NULL,            -- cli_id o usr_id según rpt_tipo
        rpt_token_hash CHAR(64) NOT NULL,   -- SHA-256 hex del token real
        rpt_expira_en DATETIME2 NOT NULL,
        rpt_usado BIT NOT NULL DEFAULT 0,
        rpt_created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT CK_rpt_tipo CHECK (rpt_tipo IN ('cliente', 'usuario'))
    );

    CREATE INDEX IX_rpt_token_hash ON dbo.param_reset_password_tokens (rpt_token_hash);
END
