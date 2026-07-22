-- Migración: Tabla Tipos_documentos_revisiones
-- Fecha: 2026-07-24
-- Descripción: Historial de cambios de un tipo de documento (tabla "Revisión /
--              Descripción del Cambio / Fecha" que llevan los formatos
--              oficiales impresos) — se dibuja una sola vez, al final de la
--              última página, en el PDF de documentos con encabezado oficial
--              configurado (F-P3-06, F-P3-07, etc). Es independiente de
--              tdo_revision (la revisión ACTUAL mostrada en el encabezado de
--              cada página) — esta tabla es el historial completo.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Tipos_documentos_revisiones')
BEGIN
    CREATE TABLE Tipos_documentos_revisiones (
        tdr_id INT IDENTITY(1,1) PRIMARY KEY,
        -- Sin FK real a Tipos_documentos: tdo_id no tiene PRIMARY KEY/UNIQUE
        -- a nivel de base de datos (mismo caso que fpo_fp_id en
        -- Formulario_pregunta_opcion) — la integridad se garantiza a nivel
        -- de aplicación, como ya es la convención en este proyecto.
        tdr_tdo_id INT NOT NULL,
        tdr_revision NVARCHAR(10) NOT NULL,
        tdr_descripcion_cambio NVARCHAR(500) NOT NULL,
        tdr_fecha DATE NOT NULL,
        tdr_orden INT NOT NULL DEFAULT 0,
        tdr_estado BIT NOT NULL DEFAULT 1,
        tdr_created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    );
    PRINT 'Tabla Tipos_documentos_revisiones creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla Tipos_documentos_revisiones ya existe';
END;
