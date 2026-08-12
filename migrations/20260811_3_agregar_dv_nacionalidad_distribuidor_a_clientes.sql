-- Tres campos nuevos en Clientes, pedidos para completar la ficha del
-- cliente: el dígito de verificación del NIT (aparte del número, que ya
-- vive en cli_nro_identificacion), si el cliente es nacional o extranjero,
-- y si pertenece a canal distribuidor. Todas NULL/0 por defecto — no
-- rompe clientes existentes ni el resto de columnas que ya sincronizan con
-- SIESA (ver plan-migracion-clientes-siesa.md).

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Clientes' AND COLUMN_NAME = 'cli_nit_dig_vf'
)
BEGIN
    ALTER TABLE Clientes
    ADD cli_nit_dig_vf VARCHAR(1) NULL;
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Clientes' AND COLUMN_NAME = 'cli_es_extranjero'
)
BEGIN
    ALTER TABLE Clientes
    ADD cli_es_extranjero BIT NOT NULL DEFAULT 0;
END

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Clientes' AND COLUMN_NAME = 'cli_es_distribuidor'
)
BEGIN
    ALTER TABLE Clientes
    ADD cli_es_distribuidor BIT NOT NULL DEFAULT 0;
END

SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Clientes'
  AND COLUMN_NAME IN ('cli_nit_dig_vf', 'cli_es_extranjero', 'cli_es_distribuidor');
