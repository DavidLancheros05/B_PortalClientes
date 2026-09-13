-- Elimina la dependencia de "centro de operación" en las solicitudes de
-- vinculación: ver Documentos Cartonera/documentacion/centro-operacion-vestigial-en-solicitudes.md.
-- Confirmado en vivo que las solicitudes creadas por el cliente siempre
-- usaban sol_co_id = 1 (hardcodeado en el frontend), y que ni los listados
-- reales ni los permisos dependen de él. Ampliación de Cupo sí llegaba a
-- usar un centro real del cliente, pero solo para pedirle un número de
-- consecutivo "por centro" a sp_ObtenerSiguienteNumeroSolicitud — se
-- consolida a un consecutivo único (mismo patrón que ya usa PQRS,
-- cons_cop_id NULL).

-- 1. Consolidar el consecutivo de SOLICITUDES_VINCULACION (ptc_id=2) a uno
--    solo global, arrancando en el máximo ya emitido entre los centros
--    existentes para no repetir ni saltar números.
IF EXISTS (SELECT 1 FROM Consecutivo WHERE cons_ptc_id = 2 AND cons_cop_id IS NULL)
BEGIN
    UPDATE c
    SET c.cons_numero_actual = m.max_numero,
        c.cons_fecha_usr = GETDATE()
    FROM Consecutivo c
    CROSS JOIN (
        SELECT MAX(cons_numero_actual) AS max_numero
        FROM Consecutivo WHERE cons_ptc_id = 2
    ) m
    WHERE c.cons_ptc_id = 2 AND c.cons_cop_id IS NULL;
END
ELSE
BEGIN
    INSERT INTO Consecutivo (cons_ptc_id, cons_cop_id, cons_numero_actual, cons_estado, cons_fecha_usr)
    SELECT 2, NULL, MAX(cons_numero_actual), 'A', GETDATE()
    FROM Consecutivo
    WHERE cons_ptc_id = 2;
END;

DELETE FROM Consecutivo WHERE cons_ptc_id = 2 AND cons_cop_id IS NOT NULL;

-- 2. Reescribir el SP sin @cop_id (consecutivo único, ya no por centro).
EXEC('
CREATE OR ALTER PROCEDURE sp_ObtenerSiguienteNumeroSolicitud
    @numero_solicitud INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cons_id INT;
    DECLARE @ptc_id INT = 2;
    DECLARE @numero_nuevo INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        SELECT @cons_id = cons_id, @numero_nuevo = cons_numero_actual
        FROM Consecutivo
        WHERE cons_ptc_id = @ptc_id AND cons_cop_id IS NULL;

        SET @numero_nuevo = @numero_nuevo + 1;
        UPDATE Consecutivo
        SET cons_numero_actual = @numero_nuevo,
            cons_fecha_usr = GETDATE()
        WHERE cons_id = @cons_id;

        SET @numero_solicitud = @numero_nuevo;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
');

-- 3. Quitar la columna sol_co_id (y sus dependencias: FK + índice único
--    compuesto) de solicitudes. El índice único (sol_numero_solicitud,
--    sol_co_id) existía porque la numeración era por centro (dos centros
--    podían compartir el mismo número); ahora que es un consecutivo único,
--    se reemplaza por un único índice sobre sol_numero_solicitud solo.
IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_numero_solicitud_centro' AND parent_object_id = OBJECT_ID('solicitudes'))
    ALTER TABLE solicitudes DROP CONSTRAINT UQ_numero_solicitud_centro;
ELSE IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_numero_solicitud_centro' AND object_id = OBJECT_ID('solicitudes'))
    DROP INDEX UQ_numero_solicitud_centro ON solicitudes;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_solicitudes_centro_operacion')
    ALTER TABLE solicitudes DROP CONSTRAINT FK_solicitudes_centro_operacion;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('solicitudes') AND name = 'sol_co_id')
    ALTER TABLE solicitudes DROP COLUMN sol_co_id;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_solicitudes_numero_solicitud' AND object_id = OBJECT_ID('solicitudes'))
    CREATE UNIQUE INDEX UQ_solicitudes_numero_solicitud ON solicitudes (sol_numero_solicitud);
