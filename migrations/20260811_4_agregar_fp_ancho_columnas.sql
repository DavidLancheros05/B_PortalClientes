-- Reemplaza fp_ancho_completo (BIT, solo full-width sí/no, y en la práctica
-- solo se usaba para DOCUMENTOS_TABLA/ARCHIVO) por fp_ancho_columnas
-- (1, 2 o 3), disponible para cualquier tipo de pregunta — permite pedir
-- media fila (2) además de fila completa (3) o el ancho por defecto (1).
--
-- Se agrega y se hace backfill en esta migración; fp_ancho_completo se
-- elimina en 20260811_5, después de actualizar el código que todavía la
-- lee/escribe (no se puede dropear en el mismo paso sin romper el backend
-- corriendo en ese momento).

-- IMPORTANTE: correr el ALTER y el UPDATE en batches separados (GO, o dos
-- llamadas a db-query.mjs) — en el mismo batch, SQL Server compila el
-- UPDATE antes de que el ALTER anterior sea visible y falla con
-- "Invalid column name 'fp_ancho_columnas'".

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Formulario_pregunta' AND COLUMN_NAME = 'fp_ancho_columnas'
)
BEGIN
    ALTER TABLE Formulario_pregunta
    ADD fp_ancho_columnas TINYINT NOT NULL DEFAULT 1
        CONSTRAINT CK_FormularioPregunta_AnchoColumnas CHECK (fp_ancho_columnas IN (1, 2, 3));
END
GO

UPDATE Formulario_pregunta
SET fp_ancho_columnas = 3
WHERE fp_ancho_completo = 1;
GO

SELECT fp_ancho_columnas, COUNT(*) AS total
FROM Formulario_pregunta
GROUP BY fp_ancho_columnas
ORDER BY fp_ancho_columnas;
