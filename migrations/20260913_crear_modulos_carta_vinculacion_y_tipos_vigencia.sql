-- Migration: crear módulos de menú para Carta de Vinculación (PDF) y
-- Tipos de Vigencia, hijos de Parametrización (mod_id 49).
--
-- Ambos controllers (CartaPdfVinculacionController, TiposVigenciaController)
-- tienen página propia y activa en el frontend, pero nunca tuvieron fila en
-- pc_modulos — por eso ModulePermissionGuard no tenía nada contra qué
-- consultar. Solo ADMIN gestiona parametrización hoy (mismo criterio que
-- Tipos de Documentos, Motivos de Rechazo, Días de Respuesta).
-- Ver documentacion/plan-solucion-autorizacion-endpoints.md.

DECLARE @modCarta INT;
SELECT TOP 1 @modCarta = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/parametrizacion/carta-pdf-vinculacion';

IF @modCarta IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id,
        mod_estado, mod_created_at
    )
    VALUES ('Carta de Vinculación (PDF)', '/parametrizacion/carta-pdf-vinculacion', NULL, 10, 49, 1, SYSDATETIME());
    SET @modCarta = CAST(SCOPE_IDENTITY() AS INT);
END

DECLARE @modVigencia INT;
SELECT TOP 1 @modVigencia = mod_id
FROM dbo.pc_modulos
WHERE mod_ruta = '/parametrizacion/tipos-vigencia';

IF @modVigencia IS NULL
BEGIN
    INSERT INTO dbo.pc_modulos (
        mod_nombre, mod_ruta, mod_icono, mod_posicion, mod_padre_id,
        mod_estado, mod_created_at
    )
    VALUES ('Tipos de Vigencia', '/parametrizacion/tipos-vigencia', NULL, 11, 49, 1, SYSDATETIME());
    SET @modVigencia = CAST(SCOPE_IDENTITY() AS INT);
END

DECLARE @adminRolId INT = 1;

IF NOT EXISTS (SELECT 1 FROM dbo.pc_rol_modulo WHERE rm_rol_id = @adminRolId AND rm_mod_id = @modCarta)
BEGIN
    INSERT INTO dbo.pc_rol_modulo (
        rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at
    ) VALUES (@adminRolId, @modCarta, 1, 1, 1, 1, 0, 1, SYSDATETIME());
END

IF NOT EXISTS (SELECT 1 FROM dbo.pc_rol_modulo WHERE rm_rol_id = @adminRolId AND rm_mod_id = @modVigencia)
BEGIN
    INSERT INTO dbo.pc_rol_modulo (
        rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at
    ) VALUES (@adminRolId, @modVigencia, 1, 1, 1, 1, 0, 1, SYSDATETIME());
END
