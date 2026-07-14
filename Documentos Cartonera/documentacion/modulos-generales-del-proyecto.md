# Módulos / temas generales del proyecto

Panorama cruzado entre `BACKEND/src/` y `FRONTEND/src/app/` (ambos repos).

## 1. Autenticación y seguridad
- Login/JWT, guards de rol (`BACKEND/src/auth`)
- Gestión de usuarios (`usuarios`, `users`)
- Roles y asignación usuario↔rol (`roles`, `usuario-roles`)
- Menús del sistema / módulos de navegación (`modulos` — CRUD de ítems de menú)
- Permisos por página/rol (`permissions`, front: `seguridad/permisos-por-pagina`)

## 2. Parametrización del formulario de solicitud
- Formularios y versiones (`parametrizacion/formularios`, front: `formulario-editor`, `formularios/[id]/versiones`)
- Secciones y preguntas del formulario (`formulario-secciones`, `formulario-preguntas`, `formulario-tipos-pregunta`, `opciones`)
- Ocultar secciones/preguntas ("documento diferido")
- Tipos de documento y plantillas asociadas (`tipos-documentos`, `tdo_tipo_plantilla`)
- Motivos de rechazo, días de respuesta por etapa, tipos de vigencia (catálogos de parametrización)

## 3. Solicitudes de vinculación comercial (core del negocio)
- Diligenciamiento (`solicitudes/nueva`, `[id]/editar`, `[id]/detalle`)
- Flujo de aprobación por etapa (Ejecutivo → Auxiliar SC → Oficial Cumplimiento → Comité Crédito 1 → Comité Crédito 2), cada una con su página de gestión propia
- Máquina de estados del workflow (`workflow/estados`, `etapas`, `resultados`, `transiciones`, `historial` — ver `FLUJO_ETAPAS.md`)
- Listados y consultas (`solicitudes-listados.service.ts`, `listado-de-solicitudes`)
- Condiciones financieras y Carta de Vinculación en PDF (`condiciones-financieras`, `carta-pdf-vinculacion`)
- Ampliación de cupo (`ampliacion-cupo`)
- Consecutivos/numeración de solicitudes (`consecutivos`)

## 4. Documentos
- Carga y gestión de documentos de la solicitud (`documentos`, `solicitud-documentos`, `sa_` = `Solicitud_archivo`)
- Revisión de vencimiento de documentos: consulta de vencidos/por vencer (`mis-documentos-vencidos`) + reporte/alerta semanal por correo (`notificaciones.service.ts::procesarAlertaSemanalDocumentos`)
- Tres sistemas de generación de PDF (completo, carta de vinculación, plantillas con placeholders)

## 5. Notificaciones y envío de correos
- Plantillas de correo editables (`notificaciones/plantillas`)
- Correos por rol / destinatarios (`correos-por-rol`, `formato-envio-correos`, `formatos-de-correos`)
- Envío de credenciales a usuarios nuevos, notificación de condiciones financieras, alerta de documentos por vencer
- Servicio de mail (`mail.service.ts`)

## 6. PQRS (peticiones, quejas, reclamos, sugerencias)
Módulo completo aparte del flujo de solicitudes: creación (`nueva`/`nuevo`), bandeja de gestión, aprobaciones, historial, reportes, configuración (tipos, estados), "mis PQRS" para el cliente.

## 7. Clientes y maestros
- Gestión de clientes (`clientes`)
- Catálogos/maestros: geográfico (país/depto/ciudad — con el bug pendiente que ya tenés anotado), tipos de identificación, centros de operación

## 8. Indicadores / reportes
- Dashboards y KPIs del negocio (`indicadores`, front: `solicitudes/indicadores`)

## 9. Integraciones externas
- Integración "UNO" (`integraciones/uno`) — parece un stub/placeholder aún no implementado (archivos casi vacíos), probablemente una integración contable/ERP planeada
