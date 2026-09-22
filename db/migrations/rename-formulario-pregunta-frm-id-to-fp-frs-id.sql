-- Rename the formulario relationship column to match the fp_* naming convention.
IF COL_LENGTH('dbo.Formulario_pregunta', 'frm_id') IS NOT NULL
   AND COL_LENGTH('dbo.Formulario_pregunta', 'fp_frs_id') IS NULL
    BEGIN
        EXECUTE sp_rename 'dbo.Formulario_pregunta.frm_id', 'fp_frs_id', 'COLUMN';
    END