-- Migración: Catálogo Tipos_vigencia
-- Fecha: 2026-07-13
-- Descripción: Mueve el enum hardcodeado de reglas de vigencia (DIAS/ANIO)
--              a una tabla catálogo administrable (nombre/descripción/estado
--              editables desde la UI). El código (tv_codigo) es inmutable:
--              es el valor que la lógica de cálculo en el backend reconoce.
--              tdo_regla_vigencia en Tipos_documentos sigue siendo varchar,
--              ahora validado contra este catálogo en vez de un @IsIn fijo.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Tipos_vigencia')
BEGIN
    CREATE TABLE Tipos_vigencia (
        tv_id INT IDENTITY(1,1) PRIMARY KEY,
        tv_codigo VARCHAR(20) NOT NULL UNIQUE,
        tv_nombre VARCHAR(150) NOT NULL,
        tv_descripcion VARCHAR(500) NULL,
        tv_estado BIT NOT NULL DEFAULT 1,
        tv_orden INT NOT NULL DEFAULT 0,
        tv_created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
    PRINT 'Tabla Tipos_vigencia creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla Tipos_vigencia ya existe';
END;

IF NOT EXISTS (SELECT 1 FROM Tipos_vigencia WHERE tv_codigo = 'DIAS')
BEGIN
    INSERT INTO Tipos_vigencia (tv_codigo, tv_nombre, tv_descripcion, tv_estado, tv_orden)
    VALUES (
        'DIAS',
        'Vencimiento por días desde la emisión',
        'El documento vence N días después de su fecha de emisión.',
        1,
        1
    );
    PRINT 'Tipo de vigencia DIAS sembrado';
END;

IF NOT EXISTS (SELECT 1 FROM Tipos_vigencia WHERE tv_codigo = 'ANIO')
BEGIN
    INSERT INTO Tipos_vigencia (tv_codigo, tv_nombre, tv_descripcion, tv_estado, tv_orden)
    VALUES (
        'ANIO',
        'Debe ser de un año específico',
        'El documento debe tener fecha de emisión dentro de un rango de años permitido (año actual y N años hacia atrás).',
        1,
        2
    );
    PRINT 'Tipo de vigencia ANIO sembrado';
END;

-- Verificación
SELECT tv_id, tv_codigo, tv_nombre, tv_estado, tv_orden FROM Tipos_vigencia ORDER BY tv_orden;
