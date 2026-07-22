-- Migración: corrige placeholder suelto en la plantilla de Manifestación suscrita F-P3-07
-- Fecha: 2026-07-19
-- Descripción: al editar la plantilla desde /parametrizacion/documentos quedó
--              un placeholder {{pregunta|1012|REPRESENTANTE LEGAL PRINCIPAL|
--              col:Ciudad de Expedición}} suelto en su propia línea, en medio
--              del párrafo de "Asociado de Negocio" (entre "...documentados y
--              mantenidos." y "Seguridad del Contenedor:"). Se quita esa línea
--              y se restaura el salto en blanco entre bloques, igual que el
--              resto de secciones del documento. El resto del contenido
--              (fijado en 20260716_contenido_manifestacion_suscrita.sql y
--              reeditado luego a placeholders {{pregunta|...}} vía la UI) no
--              cambia.

UPDATE Tipos_documentos
SET tdo_plantilla_contenido = 'Cordial saludo,

{{pregunta|1012|REPRESENTANTE LEGAL PRINCIPAL|col:Apellidos y Nombre}}, mayor de edad, identificado con cedula de ciudadanía {{pregunta|1012|REPRESENTANTE LEGAL PRINCIPAL|col:Identificacion}} de la ciudad de {{pregunta|1012|REPRESENTANTE LEGAL PRINCIPAL|col:Ciudad de Expedición}}, en calidad de representante legal de {{pregunta|1|Razón social}}, identificada con NIT {{pregunta|1|No. Identificación}}, me permito manifestar que nuestra Organización cumple con los requisitos mínimos de seguridad en la cadena de suministro internacional y sus operaciones como asociado de negocio, que nos protegen de actividades ilícitas o incidentes de contaminación.



Asociado de Negocio:
Contamos con un proceso de selección y monitoreo continuo de nuestros asociados de negocio para proteger a la Organización de tener vínculos con actividades ilícitas, lavado de activos, contrabando, tráfico de estupefacientes, tráfico de sustancias para el procesamiento de narcóticos, terrorismo, finalización del terrorismo y tráfico de armas. Este proceso incluye actividades de selección, evaluación de proveedores y clientes que garanticen su confiabilidad. Estos procesos son documentados y mantenidos.

Seguridad del Contenedor:
Contamos con procedimientos documentados para las inspecciones de contenedores, reconocer y reportar a las autoridades competentes cuando han sido vulnerados en las operaciones de comercio exterior, velando por el mantenimiento de la integridad del contenedor y demás unidades de la carga, con el propósito de disminuir la ocurrencia de actividades ilícitas.

Controles de Acceso Físico:
La Organización tiene implementados controles de acceso a las instalaciones y medidas de control para prevenir el acceso a personal no autorizado, mantener el control de los empleados y visitantes y para proteger los bienes de la misma, así como también se garantiza la vigilancia y el control de los perímetros exterior e interior.

Seguridad de los Procesos:
La Organización cuenta con procedimientos documentados para garantizar la identificación y control de acceso identificación de visitantes y personal, revisión de ingreso y salida de las instalaciones. En los lugares donde se hace manejo y almacenamiento de la carga se cuenta con controles para no permitir el acceso a personal no autorizado.

Seguridad Física:
Se cuenta con todas las medidas que garantizan la seguridad física de nuestras instalaciones, así como la vigilancia y control de los perímetros exterior e interior, controlando el acceso no autorizado.

Seguridad en Tecnología de la Información:
Se garantiza la seguridad de la información de la organización, se implementan medidas de prevención para mantener la confidencialidad e integridad de la información mediante los sistemas de información y los accesos permitidos a la documentación.

Entrenamiento en Seguridad y conciencia de amenazas:
Implementamos programas de formación para los colaboradores en todos los niveles de la Organización, con el objeto de identificar las posibles amenazas internas y/o externas en la cadena de suministro.

La anterior declaración se hace para dar cumplimiento de los estándares del Operador Económico Autorizado –OEA, de acuerdo a la normatividad colombiana expedida por la Dirección de Impuestos y Aduanas Nacionales.

Atentamente,




__________________
{{pregunta|1012|REPRESENTANTE LEGAL PRINCIPAL|col:Apellidos y Nombre}}
C.C {{pregunta|1012|REPRESENTANTE LEGAL PRINCIPAL|col:Identificacion}}
Representante Legal'
WHERE tdo_id = 15;

-- Verificación
SELECT tdo_id, tdo_nombre, tdo_plantilla_contenido FROM Tipos_documentos WHERE tdo_id = 15;
