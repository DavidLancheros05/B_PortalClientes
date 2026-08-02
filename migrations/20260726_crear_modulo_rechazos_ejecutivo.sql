-- Nuevo módulo de menú: bandeja del Ejecutivo de Negocios para solicitudes
-- rechazadas de forma definitiva por Oficial de Cumplimiento o Comité de
-- Crédito 2 (ver 20260726_agregar_gestion_rechazo_ejecutivo.sql). Cuelga del
-- mismo padre "Solicitudes" (mod_id 83) que sus hermanos de gestión, visible
-- solo para el rol EJECUTIVO.

DECLARE @modIdRechazos INT;
SELECT TOP 1 @modIdRechazos = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/solicitudes/rechazadas-ejecutivo';

IF @modIdRechazos IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre,
        mod_ruta,
        mod_icono,
        mod_posicion,
        mod_padre_id,
        mod_estado,
        mod_created_at
    )
    VALUES ('Solicitudes Rechazadas', '/solicitudes/rechazadas-ejecutivo', NULL, 11, 83, 1, SYSDATETIME());
    SET @modIdRechazos = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Solicitudes Rechazadas',
        mod_padre_id = 83,
        mod_posicion = 11,
        mod_estado = 1
    WHERE mod_id = @modIdRechazos;
END

-- Solo rol EJECUTIVO (3) ve este módulo, mismo criterio que el módulo 101
-- "Gestion Concepto Ejecutivo Comercial".
DECLARE @rolEjecutivoId INT = 3;

IF NOT EXISTS (
    SELECT 1 FROM dbo.pc_rol_modulo
    WHERE rm_rol_id = @rolEjecutivoId AND rm_mod_id = @modIdRechazos
)
BEGIN
    INSERT INTO dbo.pc_rol_modulo (
        rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar,
        rm_eliminar, rm_aprobar, rm_activo, rm_created_at
    ) VALUES (@rolEjecutivoId, @modIdRechazos, 1, 0, 0, 0, 0, 1, SYSDATETIME());
END
ELSE
BEGIN
    UPDATE dbo.pc_rol_modulo
    SET rm_ver = 1,
        rm_activo = 1,
        updated_at = SYSDATETIME()
    WHERE rm_rol_id = @rolEjecutivoId AND rm_mod_id = @modIdRechazos;
END
