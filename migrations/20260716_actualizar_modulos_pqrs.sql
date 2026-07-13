-- Migration: actualizar módulos PQRS
-- Ajusta nombres, rutas y permisos para que el rol CLIENTE vea el módulo PQRS correctamente.

DECLARE @modIdRoot INT;
SELECT TOP 1 @modIdRoot = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/pqrs' OR mod_nombre = 'PQRS';

IF @modIdRoot IS NULL
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
    VALUES ('PQRS', '/pqrs', NULL, 5, NULL, 1, SYSDATETIME());
    SET @modIdRoot = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'PQRS',
        mod_ruta = '/pqrs',
        mod_posicion = 5,
        mod_padre_id = NULL,
        mod_estado = 1
    WHERE mod_id = @modIdRoot;
END

DECLARE @modIdNueva INT;
SELECT TOP 1 @modIdNueva = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/pqrs/nueva' OR (mod_nombre = 'Nueva PQRS' AND mod_padre_id = @modIdRoot);

IF @modIdNueva IS NULL
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
    VALUES ('Nueva PQRS', '/pqrs/nueva', NULL, 1, @modIdRoot, 1, SYSDATETIME());
    SET @modIdNueva = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Nueva PQRS',
        mod_ruta = '/pqrs/nueva',
        mod_posicion = 1,
        mod_padre_id = @modIdRoot,
        mod_estado = 1
    WHERE mod_id = @modIdNueva;
END

DECLARE @modIdMis INT;
SELECT TOP 1 @modIdMis = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/pqrs/mis-pqrs' OR (mod_nombre = 'Mis PQRS' AND mod_padre_id = @modIdRoot);

IF @modIdMis IS NULL
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
    VALUES ('Mis PQRS', '/pqrs/mis-pqrs', NULL, 2, @modIdRoot, 1, SYSDATETIME());
    SET @modIdMis = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Mis PQRS',
        mod_ruta = '/pqrs/mis-pqrs',
        mod_posicion = 2,
        mod_padre_id = @modIdRoot,
        mod_estado = 1
    WHERE mod_id = @modIdMis;
END

-- Asignar permisos al rol CLIENTE para los módulos relevantes
DECLARE @clienteRolId INT = 2;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.pc_rol_modulo
    WHERE rm_rol_id = @clienteRolId AND rm_mod_id = @modIdRoot
)
BEGIN
    INSERT INTO dbo.pc_rol_modulo (
        rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar,
        rm_eliminar, rm_aprobar, rm_activo, rm_created_at
    ) VALUES (@clienteRolId, @modIdRoot, 1, 1, 0, 0, 0, 1, SYSDATETIME());
END
ELSE
BEGIN
    UPDATE dbo.pc_rol_modulo
    SET rm_ver = 1,
        rm_crear = 1,
        rm_activo = 1,
        updated_at = SYSDATETIME()
    WHERE rm_rol_id = @clienteRolId AND rm_mod_id = @modIdRoot;
END

IF NOT EXISTS (
    SELECT 1
    FROM dbo.pc_rol_modulo
    WHERE rm_rol_id = @clienteRolId AND rm_mod_id = @modIdNueva
)
BEGIN
    INSERT INTO dbo.pc_rol_modulo (
        rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar,
        rm_eliminar, rm_aprobar, rm_activo, rm_created_at
    ) VALUES (@clienteRolId, @modIdNueva, 1, 1, 0, 0, 0, 1, SYSDATETIME());
END
ELSE
BEGIN
    UPDATE dbo.pc_rol_modulo
    SET rm_ver = 1,
        rm_crear = 1,
        rm_activo = 1,
        updated_at = SYSDATETIME()
    WHERE rm_rol_id = @clienteRolId AND rm_mod_id = @modIdNueva;
END

IF NOT EXISTS (
    SELECT 1
    FROM dbo.pc_rol_modulo
    WHERE rm_rol_id = @clienteRolId AND rm_mod_id = @modIdMis
)
BEGIN
    INSERT INTO dbo.pc_rol_modulo (
        rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar,
        rm_eliminar, rm_aprobar, rm_activo, rm_created_at
    ) VALUES (@clienteRolId, @modIdMis, 1, 0, 0, 0, 0, 1, SYSDATETIME());
END
ELSE
BEGIN
    UPDATE dbo.pc_rol_modulo
    SET rm_ver = 1,
        rm_activo = 1,
        updated_at = SYSDATETIME()
    WHERE rm_rol_id = @clienteRolId AND rm_mod_id = @modIdMis;
END
