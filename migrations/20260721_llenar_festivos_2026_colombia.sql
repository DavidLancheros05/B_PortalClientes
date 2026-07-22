-- Migration: calendario de festivos de Colombia 2026 (18 festivos oficiales).
-- fes_co_id = NULL -> aplica a todas las compañías (mismo criterio que las
-- consultas ya existentes: `WHERE fes_co_id = @co_id OR fes_co_id IS NULL`).
--
-- Fechas movidas a lunes por Ley Emiliani calculadas a partir de Pascua
-- 2026-04-05 (algoritmo de Gauss/Meeus) y del día de la semana real de cada
-- fecha fija (2026-01-01 = jueves). Los 6 festivos que NUNCA se trasladan
-- (Año Nuevo, Día del Trabajo, Independencia, Batalla de Boyacá, Inmaculada
-- Concepción, Navidad) y los 2 relativos a Semana Santa que tampoco se
-- trasladan (Jueves y Viernes Santo) se insertan en su fecha real.

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-01-01' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-01-01', 'Año Nuevo', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-01-12' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-01-12', 'Reyes Magos', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-03-23' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-03-23', 'San José', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-04-02' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-04-02', 'Jueves Santo', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-04-03' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-04-03', 'Viernes Santo', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-05-01' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-05-01', 'Día del Trabajo', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-05-18' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-05-18', 'Ascensión del Señor', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-06-08' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-06-08', 'Corpus Christi', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-06-15' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-06-15', 'Sagrado Corazón de Jesús', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-06-29' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-06-29', 'San Pedro y San Pablo', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-07-20' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-07-20', 'Grito de Independencia', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-08-07' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-08-07', 'Batalla de Boyacá', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-08-17' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-08-17', 'Asunción de la Virgen', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-10-12' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-10-12', 'Día de la Raza', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-11-02' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-11-02', 'Todos los Santos', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-11-16' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-11-16', 'Independencia de Cartagena', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-12-08' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-12-08', 'Inmaculada Concepción', NULL);

IF NOT EXISTS (SELECT 1 FROM dbo.Festivos WHERE fes_fecha = '2026-12-25' AND fes_co_id IS NULL)
    INSERT INTO dbo.Festivos (fes_fecha, fes_descripcion, fes_co_id) VALUES ('2026-12-25', 'Navidad', NULL);
