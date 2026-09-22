-- Renombra el resultado de workflow usado mientras el cliente debe generar
-- y firmar nuevamente los documentos de la solicitud.
IF EXISTS (SELECT 1
           FROM   workflow_estado_etapa
           WHERE  wee_codigo = 'PEND_FIRMA')
   AND NOT EXISTS (SELECT 1
                   FROM   workflow_estado_etapa
                   WHERE  wee_codigo = 'PEND_FIRMA')
    BEGIN
        UPDATE workflow_estado_etapa
        SET    wee_codigo = 'PEND_FIRMA',
               wee_nombre = 'Pendiente de firma'
        WHERE  wee_codigo = 'PEND_FIRMA';
    END

IF EXISTS (SELECT 1
           FROM   workflow_estado_etapa
           WHERE  wee_codigo = 'PEND_FIRMA')
    BEGIN
        UPDATE workflow_estado_etapa
        SET    wee_nombre = 'Pendiente de firma'
        WHERE  wee_codigo = 'PEND_FIRMA';
    END