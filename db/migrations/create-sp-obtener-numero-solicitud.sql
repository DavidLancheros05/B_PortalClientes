-- Crear procedimiento para generar números secuenciales de solicitudes
-- Usa la tabla Consecutivo y Tipo_consecutivo

IF OBJECT_ID('sp_ObtenerSiguienteNumeroSolicitud', 'P') IS NOT NULL
    DROP PROCEDURE sp_ObtenerSiguienteNumeroSolicitud;
GO

CREATE PROCEDURE sp_ObtenerSiguienteNumeroSolicitud
    @numero_solicitud NVARCHAR(50) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @cons_id INT;
    DECLARE @ptc_id INT = 2;  -- SOLICITUDES_VINCULACION
    DECLARE @prefijo NVARCHAR(10);
    DECLARE @numero_actual INT;
    DECLARE @numero_nuevo INT;
    DECLARE @ano_actual INT;
    DECLARE @mes_actual INT;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Obtener el prefijo del tipo de consecutivo
        SELECT @prefijo = ptc_prefijo
        FROM Tipo_consecutivo
        WHERE ptc_id = @ptc_id AND ptc_estado = 'A';

        IF @prefijo IS NULL
            THROW 50001, 'Tipo de consecutivo SOLICITUDES_VINCULACION no encontrado', 1;

        -- 2. Obtener o crear el registro del consecutivo
        SELECT @cons_id = cons_id, @numero_actual = cons_numero_actual
        FROM Consecutivo
        WHERE cons_ptc_id = @ptc_id;

        IF @cons_id IS NULL
        BEGIN
            INSERT INTO Consecutivo (cons_ptc_id, cons_numero_actual, cons_estado, cons_fecha_usr)
            VALUES (@ptc_id, 1, 'A', GETDATE());
            SET @numero_nuevo = 1;
            SET @cons_id = SCOPE_IDENTITY();
        END
        ELSE
        BEGIN
            -- 3. Incrementar el número
            SET @numero_nuevo = @numero_actual + 1;
            UPDATE Consecutivo
            SET cons_numero_actual = @numero_nuevo,
                cons_fecha_usr = GETDATE()
            WHERE cons_id = @cons_id;
        END;

        -- 4. Generar el número con formato: SV-YYYY-MM-000001
        SET @ano_actual = YEAR(GETDATE());
        SET @mes_actual = MONTH(GETDATE());

        SET @numero_solicitud = @prefijo + '-' +
                                CAST(@ano_actual AS NVARCHAR(4)) + '-' +
                                RIGHT('0' + CAST(@mes_actual AS NVARCHAR(2)), 2) + '-' +
                                RIGHT('000000' + CAST(@numero_nuevo AS NVARCHAR(6)), 6);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
