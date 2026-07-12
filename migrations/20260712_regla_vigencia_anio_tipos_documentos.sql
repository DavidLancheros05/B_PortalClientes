-- Migración: Regla de vigencia por año de emisión para Tipos_documentos
-- Fecha: 2026-07-12
-- Descripción: Hasta ahora la vigencia de un documento solo se podía definir
--              como "N días desde la fecha de emisión" (tdo_vigencia_dias).
--              Se agrega un segundo modo alternativo: "debe ser de un año
--              específico" (ej. RUT = solo año actual, Estados GYP = año
--              actual o el anterior), parametrizado como "años hacia atrás
--              permitidos" (0 = solo año actual, 1 = año actual o anterior).
--              tdo_regla_vigencia indica cuál de los dos modos aplica.

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Tipos_documentos' AND COLUMN_NAME = 'tdo_regla_vigencia'
)
BEGIN
    ALTER TABLE Tipos_documentos
    ADD tdo_regla_vigencia VARCHAR(20) NULL;
    PRINT 'Columna tdo_regla_vigencia agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna tdo_regla_vigencia ya existe';
END;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Tipos_documentos' AND COLUMN_NAME = 'tdo_anios_atras_permitidos'
)
BEGIN
    ALTER TABLE Tipos_documentos
    ADD tdo_anios_atras_permitidos INT NULL;
    PRINT 'Columna tdo_anios_atras_permitidos agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna tdo_anios_atras_permitidos ya existe';
END;

-- Verificación
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Tipos_documentos'
  AND COLUMN_NAME IN ('tdo_regla_vigencia', 'tdo_anios_atras_permitidos');
