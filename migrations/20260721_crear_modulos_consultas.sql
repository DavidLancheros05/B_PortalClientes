-- Migration: crear módulo "Consultas" y sus 4 submódulos (remisiones,
-- facturas, existencias, cartera), agregados en esta sesión en
-- src/{remisiones,facturas,existencias,cartera} y
-- F_PortalClientes/src/app/consultas/**. Sin esta fila en pc_modulos +
-- pc_rol_modulo el menú (dinámico, ver Header.tsx/ModulosService.findByRol)
-- nunca los muestra, sin importar que el código de la página exista.
--
-- Mismo patrón de permisos que el módulo "Pedidos" (mod_id 75/76/77):
-- ADMIN con todos los permisos, CLIENTE solo con rm_ver, el resto de roles
-- con fila presente pero todo en 0 (rol COMERCIAL, id 4, se deja fuera —
-- Pedidos tampoco le asigna fila).

DECLARE @modIdConsultas INT;
SELECT TOP 1 @modIdConsultas = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/consultas' OR mod_nombre = 'Consultas';

IF @modIdConsultas IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Consultas', '/consultas', NULL, 8, NULL, 1, SYSDATETIME());
    SET @modIdConsultas = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Consultas', mod_ruta = '/consultas', mod_padre_id = NULL, mod_estado = 1
    WHERE mod_id = @modIdConsultas;
END

DECLARE @modIdRemisiones INT;
SELECT TOP 1 @modIdRemisiones = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/consultas/remisiones' OR (mod_nombre = 'Remisiones y devoluciones' AND mod_padre_id = @modIdConsultas);

IF @modIdRemisiones IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Remisiones y devoluciones', '/consultas/remisiones', NULL, 1, @modIdConsultas, 1, SYSDATETIME());
    SET @modIdRemisiones = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Remisiones y devoluciones', mod_ruta = '/consultas/remisiones', mod_posicion = 1, mod_padre_id = @modIdConsultas, mod_estado = 1
    WHERE mod_id = @modIdRemisiones;
END

DECLARE @modIdFacturas INT;
SELECT TOP 1 @modIdFacturas = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/consultas/facturas' OR (mod_nombre = 'Facturas y notas' AND mod_padre_id = @modIdConsultas);

IF @modIdFacturas IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Facturas y notas', '/consultas/facturas', NULL, 2, @modIdConsultas, 1, SYSDATETIME());
    SET @modIdFacturas = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Facturas y notas', mod_ruta = '/consultas/facturas', mod_posicion = 2, mod_padre_id = @modIdConsultas, mod_estado = 1
    WHERE mod_id = @modIdFacturas;
END

DECLARE @modIdExistencias INT;
SELECT TOP 1 @modIdExistencias = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/consultas/existencias' OR (mod_nombre = 'Existencia por bodega' AND mod_padre_id = @modIdConsultas);

IF @modIdExistencias IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Existencia por bodega', '/consultas/existencias', NULL, 3, @modIdConsultas, 1, SYSDATETIME());
    SET @modIdExistencias = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Existencia por bodega', mod_ruta = '/consultas/existencias', mod_posicion = 3, mod_padre_id = @modIdConsultas, mod_estado = 1
    WHERE mod_id = @modIdExistencias;
END

DECLARE @modIdCartera INT;
SELECT TOP 1 @modIdCartera = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/consultas/cartera' OR (mod_nombre = 'Resumen de saldos' AND mod_padre_id = @modIdConsultas);

IF @modIdCartera IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Resumen de saldos', '/consultas/cartera', NULL, 4, @modIdConsultas, 1, SYSDATETIME());
    SET @modIdCartera = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Resumen de saldos', mod_ruta = '/consultas/cartera', mod_posicion = 4, mod_padre_id = @modIdConsultas, mod_estado = 1
    WHERE mod_id = @modIdCartera;
END

-- Permisos por rol para los 5 módulos nuevos (padre + 4 hijos), mismo
-- patrón que Pedidos: ADMIN todo en 1, CLIENTE solo rm_ver, resto en 0.
DECLARE @modulos TABLE (mod_id INT);
INSERT INTO @modulos (mod_id)
VALUES (@modIdConsultas), (@modIdRemisiones), (@modIdFacturas), (@modIdExistencias), (@modIdCartera);

DECLARE @roles TABLE (rol_id INT);
INSERT INTO @roles (rol_id) VALUES (1), (2), (3), (5), (6), (7), (8);

DECLARE @rolId INT, @modId INT, @ver BIT, @crear BIT, @editar BIT, @eliminar BIT, @aprobar BIT;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT r.rol_id, m.mod_id FROM @roles r CROSS JOIN @modulos m;

OPEN cur;
FETCH NEXT FROM cur INTO @rolId, @modId;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @ver = CASE WHEN @rolId IN (1, 2) THEN 1 ELSE 0 END;
    SET @crear = CASE WHEN @rolId = 1 THEN 1 ELSE 0 END;
    SET @editar = CASE WHEN @rolId = 1 THEN 1 ELSE 0 END;
    SET @eliminar = CASE WHEN @rolId = 1 THEN 1 ELSE 0 END;
    SET @aprobar = CASE WHEN @rolId = 1 THEN 1 ELSE 0 END;

    IF NOT EXISTS (SELECT 1 FROM dbo.pc_rol_modulo WHERE rm_rol_id = @rolId AND rm_mod_id = @modId)
    BEGIN
        INSERT INTO dbo.pc_rol_modulo (
            rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at
        ) VALUES (@rolId, @modId, @ver, @crear, @editar, @eliminar, @aprobar, 1, SYSDATETIME());
    END
    ELSE
    BEGIN
        UPDATE dbo.pc_rol_modulo
        SET rm_ver = @ver, rm_crear = @crear, rm_editar = @editar, rm_eliminar = @eliminar, rm_aprobar = @aprobar, rm_activo = 1, updated_at = SYSDATETIME()
        WHERE rm_rol_id = @rolId AND rm_mod_id = @modId;
    END

    FETCH NEXT FROM cur INTO @rolId, @modId;
END

CLOSE cur;
DEALLOCATE cur;
