-- Reorganiza el menú de documentos bajo un solo padre "Documentos"
-- (mod_id ya existente, ruta /solicitudes/documentos, hoy vacío/sin hijos):
--   1. Mis Documentos            (/solicitudes/mis-documentos)       -- ya existía, se reparenta
--   2. Documentos Solicitudes    (/solicitudes/listado-documentos)   -- ya existía como "Listado de documentos", se renombra y reparenta
--   3. Documentos Cliente        (/solicitudes/documentos-cliente)   -- NUEVO, la página aún no está construida (queda pendiente, igual que
--                                                                       "Solicitud Ampliación Cupo" estuvo un tiempo en el menú antes de conectarse)
--   4. Documentos Vencidos       (/solicitudes/mis-documentos-vencidos) -- ya existía como "Mis documentos vencidos", se renombra y reparenta
--
-- También amplía quién ve "Mis Documentos" en el menú: hoy solo CLIENTE
-- (ADMIN no tenía ninguna fila — solo entraba por URL directa; EJECUTIVO
-- tenía una fila que se lo negaba explícitamente). Con el selector de
-- cliente agregado a esa página, ADMIN y EJECUTIVO también deben poder
-- llegar ahí desde el menú.

-- 1) Padre "Documentos" (mod_id 84) — confirmar datos, no cambia de lugar.
DECLARE @modIdDocumentos INT;
SELECT TOP 1 @modIdDocumentos = mod_id FROM dbo.pc_modulos WHERE mod_ruta = '/solicitudes/documentos';

DECLARE @modIdSolicitudes INT;
SELECT TOP 1 @modIdSolicitudes = mod_id FROM dbo.pc_modulos WHERE mod_ruta = '/solicitudes' AND mod_padre_id IS NULL;

IF @modIdDocumentos IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Documentos', '/solicitudes/documentos', NULL, 6, @modIdSolicitudes, 1, SYSDATETIME());
    SET @modIdDocumentos = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Documentos', mod_padre_id = @modIdSolicitudes, mod_estado = 1
    WHERE mod_id = @modIdDocumentos;
END

-- 2) Mis Documentos -> hijo 1
DECLARE @modIdMisDocumentos INT;
SELECT TOP 1 @modIdMisDocumentos = mod_id FROM dbo.pc_modulos WHERE mod_ruta = '/solicitudes/mis-documentos';

UPDATE dbo.pc_modulos
SET mod_nombre = 'Mis Documentos', mod_padre_id = @modIdDocumentos, mod_posicion = 1, mod_estado = 1
WHERE mod_id = @modIdMisDocumentos;

-- 3) Documentos Solicitudes (antes "Listado de documentos") -> hijo 2
DECLARE @modIdListadoDocs INT;
SELECT TOP 1 @modIdListadoDocs = mod_id FROM dbo.pc_modulos WHERE mod_ruta = '/solicitudes/listado-documentos';

UPDATE dbo.pc_modulos
SET mod_nombre = 'Documentos Solicitudes', mod_padre_id = @modIdDocumentos, mod_posicion = 2, mod_estado = 1
WHERE mod_id = @modIdListadoDocs;

-- 4) Documentos Cliente -> hijo 3 (NUEVO, página pendiente de construir)
DECLARE @modIdDocsCliente INT;
SELECT TOP 1 @modIdDocsCliente = mod_id FROM dbo.pc_modulos WHERE mod_ruta = '/solicitudes/documentos-cliente';

IF @modIdDocsCliente IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id, mod_estado, mod_created_at
    ) VALUES ('Documentos Cliente', '/solicitudes/documentos-cliente', NULL, 3, @modIdDocumentos, 1, SYSDATETIME());
    SET @modIdDocsCliente = CAST(SCOPE_IDENTITY() AS INT);
END
ELSE
BEGIN
    UPDATE dbo.pc_modulos
    SET mod_nombre = 'Documentos Cliente', mod_padre_id = @modIdDocumentos, mod_posicion = 3, mod_estado = 1
    WHERE mod_id = @modIdDocsCliente;
END

-- 5) Documentos Vencidos (antes "Mis documentos vencidos") -> hijo 4
DECLARE @modIdDocsVencidos INT;
SELECT TOP 1 @modIdDocsVencidos = mod_id FROM dbo.pc_modulos WHERE mod_ruta = '/solicitudes/mis-documentos-vencidos';

UPDATE dbo.pc_modulos
SET mod_nombre = 'Documentos Vencidos', mod_padre_id = @modIdDocumentos, mod_posicion = 4, mod_estado = 1
WHERE mod_id = @modIdDocsVencidos;

-- 6) Permisos: ADMIN y EJECUTIVO ven el padre "Documentos" y "Mis
-- Documentos" (antes solo CLIENTE veía "Mis Documentos" en el menú).
-- "Documentos Cliente" (nuevo) queda visible para ADMIN/EJECUTIVO, con fila
-- explícita en 0 para el resto de roles (mismo criterio que "Consultas").
-- "Documentos Solicitudes" y "Documentos Vencidos" NO se tocan aquí: ya
-- tenían su propia configuración de permisos (ADMIN + COMITE CREDITO 2 en
-- el primero, solo ADMIN en el segundo) y no se pidió cambiarla.
DECLARE @rolId INT, @modId INT, @ver BIT;
DECLARE @permisos TABLE (rol_id INT, mod_id INT, ver BIT);
INSERT INTO @permisos (rol_id, mod_id, ver) VALUES
    (1, @modIdDocumentos, 1),    -- ADMIN ve el padre
    (3, @modIdDocumentos, 1),    -- EJECUTIVO ve el padre
    (1, @modIdMisDocumentos, 1), -- ADMIN ve Mis Documentos
    (3, @modIdMisDocumentos, 1), -- EJECUTIVO ve Mis Documentos
    (1, @modIdDocsCliente, 1),   -- ADMIN ve Documentos Cliente
    (3, @modIdDocsCliente, 1),   -- EJECUTIVO ve Documentos Cliente
    (2, @modIdDocsCliente, 0),   -- CLIENTE: fila explícita, sin acceso por ahora
    (5, @modIdDocsCliente, 0),   -- AUXILIAR SERVICIO CLIENTE: ídem
    (6, @modIdDocsCliente, 0),   -- OFICIAL DE CUMPLIMIENTO: ídem
    (7, @modIdDocsCliente, 0),   -- COMITE CREDITO 1: ídem
    (8, @modIdDocsCliente, 0);   -- COMITE CREDITO 2: ídem

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT rol_id, mod_id, ver FROM @permisos;
OPEN cur;
FETCH NEXT FROM cur INTO @rolId, @modId, @ver;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.pc_rol_modulo WHERE rm_rol_id = @rolId AND rm_mod_id = @modId)
    BEGIN
        INSERT INTO dbo.pc_rol_modulo (
            rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at
        ) VALUES (@rolId, @modId, @ver, 0, 0, 0, 0, 1, SYSDATETIME());
    END
    ELSE
    BEGIN
        UPDATE dbo.pc_rol_modulo
        SET rm_ver = @ver, rm_activo = 1, updated_at = SYSDATETIME()
        WHERE rm_rol_id = @rolId AND rm_mod_id = @modId;
    END

    FETCH NEXT FROM cur INTO @rolId, @modId, @ver;
END

CLOSE cur;
DEALLOCATE cur;
