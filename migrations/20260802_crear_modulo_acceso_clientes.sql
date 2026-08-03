-- Migration: crear submódulo "Acceso a Clientes" bajo el módulo existente
-- "Clientes" (mod_id 92, mod_ruta '/parametrizacion/clientes'), agregado en
-- esta sesión en F_PortalClientes/src/app/parametrizacion/clientes/acceso.
-- Sin esta fila en pc_modulos + pc_rol_modulo el menú (dinámico, ver
-- Header.tsx/ModulosService.findByRol) nunca lo muestra, sin importar que el
-- código de la página exista.
--
-- Mismo criterio que el módulo padre "Clientes": solo ADMIN (rol_id 1) lo ve,
-- el resto de roles queda con fila presente pero todo en 0.

DECLARE @modIdClientes INT;
SELECT TOP 1 @modIdClientes = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/parametrizacion/clientes' AND mod_padre_id IS NOT NULL AND mod_estado = 1;

DECLARE @modIdAcceso INT;
SELECT TOP 1 @modIdAcceso = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/parametrizacion/clientes/acceso';

IF @modIdAcceso IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Acceso a Clientes', '/parametrizacion/clientes/acceso', NULL, 2, @modIdClientes, 1, SYSDATETIME());
    SET @modIdAcceso = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Acceso a Clientes', mod_ruta = '/parametrizacion/clientes/acceso', mod_posicion = 2, mod_padre_id = @modIdClientes, mod_estado = 1
    WHERE mod_id = @modIdAcceso;
END

DECLARE @roles TABLE (rol_id INT);
INSERT INTO @roles (rol_id) VALUES (1), (2), (3), (4), (5), (6), (7), (8);

DECLARE @rolId INT, @ver BIT, @editar BIT;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT rol_id FROM @roles;

OPEN cur;
FETCH NEXT FROM cur INTO @rolId;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @ver = CASE WHEN @rolId = 1 THEN 1 ELSE 0 END;
    SET @editar = CASE WHEN @rolId = 1 THEN 1 ELSE 0 END;

    IF NOT EXISTS (SELECT 1 FROM dbo.pc_rol_modulo WHERE rm_rol_id = @rolId AND rm_mod_id = @modIdAcceso)
    BEGIN
        INSERT INTO dbo.pc_rol_modulo (
            rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at
        ) VALUES (@rolId, @modIdAcceso, @ver, 0, @editar, 0, 0, 1, SYSDATETIME());
    END
    ELSE
    BEGIN
        UPDATE dbo.pc_rol_modulo
        SET rm_ver = @ver, rm_editar = @editar, rm_activo = 1, updated_at = SYSDATETIME()
        WHERE rm_rol_id = @rolId AND rm_mod_id = @modIdAcceso;
    END

    FETCH NEXT FROM cur INTO @rolId;
END

CLOSE cur;
DEALLOCATE cur;
