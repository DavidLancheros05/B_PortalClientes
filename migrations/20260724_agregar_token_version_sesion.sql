-- Migration: columna de "versión de token" para poder invalidar sesiones
-- del lado del servidor. Hoy el logout es 100% client-side (borra
-- localStorage/cookies) — un JWT ya emitido sigue siendo válido hasta que
-- expira por sí solo (7 días), sin forma de revocarlo antes. Con esta
-- columna, el JWT lleva la versión vigente al momento de emitirse (claim
-- `tv`); JwtAuthGuard la compara contra el valor actual en BD en cada
-- request, y el logout (o un cambio de contraseña) la incrementa,
-- invalidando de inmediato cualquier token viejo de ese usuario/cliente.
-- Ver documentacion/autenticacion-y-seguridad-sesion.md, hallazgo #4.

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.usuarios') AND name = 'usr_token_version'
)
BEGIN
    ALTER TABLE dbo.usuarios ADD usr_token_version INT NOT NULL DEFAULT 0;
END

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Clientes') AND name = 'cli_token_version'
)
BEGIN
    ALTER TABLE dbo.Clientes ADD cli_token_version INT NOT NULL DEFAULT 0;
END
