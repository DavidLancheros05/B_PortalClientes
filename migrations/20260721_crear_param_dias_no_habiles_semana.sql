-- Migration: tabla de configuración de días de la semana no hábiles.
-- Antes, business-days.util.ts tenía sábado/domingo hardcodeados
-- (`date.getDay() === 0 || date.getDay() === 6`). El usuario pidió que esto
-- también sea parametrizable, igual que ya lo es Festivos (fechas puntuales
-- no hábiles). Mismo criterio de alcance que Festivos: sin pantalla propia
-- de administración, se edita directo en BD.
--
-- dsh_dia_semana usa la misma convención que JS Date.getUTCDay():
-- 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado.
-- dsh_co_id NULL = aplica a todas las compañías (mismo criterio que
-- fes_co_id IS NULL en Festivos).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'param_dias_no_habiles_semana')
BEGIN
    CREATE TABLE dbo.param_dias_no_habiles_semana (
        dsh_id INT IDENTITY(1,1) PRIMARY KEY,
        dsh_co_id INT NULL,
        dsh_dia_semana SMALLINT NOT NULL,
        dsh_activo BIT NOT NULL DEFAULT 1,
        dsh_created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT CK_dsh_dia_semana CHECK (dsh_dia_semana BETWEEN 0 AND 6)
    );
END

-- Seed: preserva el comportamiento actual (sábado=6, domingo=0) para todas
-- las compañías, hasta que alguien lo edite manualmente.
IF NOT EXISTS (SELECT 1 FROM dbo.param_dias_no_habiles_semana WHERE dsh_co_id IS NULL AND dsh_dia_semana = 0)
BEGIN
    INSERT INTO dbo.param_dias_no_habiles_semana (dsh_co_id, dsh_dia_semana, dsh_activo)
    VALUES (NULL, 0, 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.param_dias_no_habiles_semana WHERE dsh_co_id IS NULL AND dsh_dia_semana = 6)
BEGIN
    INSERT INTO dbo.param_dias_no_habiles_semana (dsh_co_id, dsh_dia_semana, dsh_activo)
    VALUES (NULL, 6, 1);
END
