select * from Clientes
select * from Usuarios
select * from forma_pago


Solicitud_archivo 

select * from solicitudes

select sol_id, sol_numero_solicitud,sol_estado_id, sol_etapa_actual_id,	sol_resultado_etapa_id  from solicitudes where sol_numero_solicitud =6
select sol_numero_solicitud from solicitudes

update solicitudes set sol_estado_id=2, sol_etapa_actual_id=1,sol_resultado_etapa_id=5 where sol_numero_solicitud =6

sol_estado_id, sol_etapa_actual_id,sol_resultado_etapa_id, accion
3 3 1 Auxiliar, La auxiliar debe dar mirar y aprobar o rechazar
2 PENDIENTE | 1 CLI | 5 PEND_DOCS
select * from solicitud_estados
select * from workflow_etapas
select * from workflow_estado_etapa 


update Solicitud_archivo set sa_requiere_cambio=1 where sa_id in(
67,
68)

select * from  Solicitud_archivo where sa_sol_id=2175
select * from  Solicitud_archivo where sa_sol_id=2174 
select sd_requiere_cambio from Solicitud_documento where sd_solicitud_id=2174

1151
select * from  Usuarios where

usr_id in (
1049,
1051,
1052,
1053
)
update  Usuarios set usr_correo='cristian.rodriguez0597@gmail.com'  where

usr_id in (
1049,
1051,
1052,
1053
)


1	1


cristian.rodriguez0597@gmail.com


-- Crear la tabla
CREATE TABLE Forma_pago (
    fpg_id INT NOT NULL PRIMARY KEY,
    fpg_nombre VARCHAR(100) NOT NULL
);

-- Insertar datos
INSERT INTO Forma_pago (fpg_id, fpg_nombre)
VALUES
(1, 'CONTADO 1 DIA'),
(2, 'CREDITO 8 DIAS'),
(3, 'CREDITO 15 DIAS'),
(5, 'CREDITO 30 DIAS'),
(6, 'CREDITO 45 DIAS'),
(8, 'CREDITO 60 DIAS'),
(9, 'CREDITO 75 DIAS'),
(10, 'CREDITO 90 DIAS'),
(11, 'CREDITO 120 DIAS'),
(12, 'CREDITO 150 DIAS'),
(13, 'CONTADO CON ANTICIPO'),
(14, 'CREDITO 100 DIAS'),
(15, 'CREDITO 20 DIAS'),
(19, 'ANTICIPADO');