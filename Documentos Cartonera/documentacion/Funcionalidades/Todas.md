# Funcionalidades del Portal de Clientes (Cartonera)

> Inventario de funcionalidades identificadas en el código (BACKEND + FRONTEND) y en `FLUJO_ETAPAS.md`. Generado 2026-07-18 — verificar contra el código si pasa mucho tiempo desde esta fecha.

## 1. Autenticación y Seguridad
- Login con dos tipos de acceso (cliente / usuario interno)
- Autenticación JWT
- Autorización por rol (Guards + `@Roles`)
- Cambio de contraseña (usuario interno)
- Cambio de contraseña (cliente)
- Página "Acceso no autorizado"
- Bloqueo de usuario inactivo en login/dashboard

## 2. Gestión de Usuarios (personal interno)
- CRUD de usuarios
- Listado de ejecutivos de negocio
- Obtener usuario autenticado (`/usuarios/me`)
- Asignación de centros de operación a usuario
- Asignación múltiple de centros
- Pantallas de administración de usuarios
- Envío de credenciales por correo al crear usuario

## 3. Roles, Módulos y Permisos (Seguridad)
- CRUD de roles
- Asignación de módulos a un rol (permisos: ver, crear, editar, eliminar, aprobar)
- CRUD de módulos de navegación
- Módulos filtrados por rol (armado de menú)
- Asignación usuario↔rol
- Pantallas de seguridad (roles, módulos, usuario-roles, permisos por página)
- Consulta general de roles/módulos

## 4. Clientes
- CRUD de clientes
- Perfil del cliente (autoservicio)
- Clientes por centro de operación
- Centros de operación de un cliente
- Listado de clientes aprobados
- Listado de ejecutivos de negocio para asignación
- Pantallas de administración de clientes (listado, crear, ver detalle, editar)

## 5. Maestros / Catálogos
- Catálogo geográfico (país → departamento → ciudad)
- Catálogo genérico configurable
- Catálogo de documentos
- Explorador de esquema de BD (para preguntas tipo catálogo)
- Tipos de identificación
- Centros de operación

## 6. Solicitud de Vinculación Comercial — Diligenciamiento (Cliente)
- Crear solicitud
- Página "Nueva solicitud" (con redirección automática si ya hay borrador/activa)
- Editar/continuar solicitud
- Ver solicitud (solo lectura)
- Guardar respuestas del formulario
- Guardar respuesta tipo archivo
- Actualizar fecha de emisión de un documento
- Eliminar archivo de una respuesta
- Consultar respuestas de una solicitud
- Formulario renderizable (armado dinámico del formulario)
- Consulta de últimas/última solicitud del cliente
- Estadísticas del cliente
- Historial de solicitudes del cliente
- Eliminar solicitud
- Generar PDF completo de la solicitud
- Representante legal para plantillas

## 7. Documentos de la Solicitud
- CRUD de tipos de documento
- CRUD genérico de documentos (módulo `documentos`)
- Tipos de vigencia de documentos
- Documentos con estado de vigencia
- Documentos requeridos de una solicitud
- "Mis Documentos" (cliente)
- Mis documentos vencidos
- Verificar y avanzar documentos diferidos
- Listado global de documentos
- Descargar archivo
- Soportes de análisis (personal interno)
- Corregir formulario (Auxiliar Servicio Cliente)

## 8. Formularios Dinámicos (Parametrización)
- CRUD de formularios
- Formulario activo
- Versionamiento de formularios (nueva versión, activar, eliminar)
- CRUD de secciones del formulario
- CRUD de preguntas del formulario
- CRUD de opciones de pregunta
- Tipos de pregunta
- Editor visual de formularios
- Preguntas del formulario activo
- Secciones con preguntas por formulario
- Ocultar pregunta específica (regla de negocio puntual)

## 9. Flujo de Aprobación / Workflow (por cargo)
- Bandeja "Pendientes" genérica
- Envío inicial del cliente (Cliente → Ejecutivo de Negocios)
- Bandeja del Ejecutivo de Negocios
- Registrar concepto comercial (Ejecutivo de Negocios)
- Bandeja del Auxiliar de Servicio al Cliente
- Aprobar/Rechazar documentación (Auxiliar Servicio Cliente) — los dos modos
  de solución (`cliente_actualiza` / `auxiliar_actualiza`) y su conexión con
  `corregir-formulario-asc` están documentados en
  [modo-solucion-rechazo-asc.md](modo-solucion-rechazo-asc.md)
- Concepto genérico Auxiliar (variante)
- Bandeja del Oficial de Cumplimiento
- Concepto del Oficial de Cumplimiento
- Bandeja de Comité de Crédito 1
- Revisión de Comité de Crédito 1
- Bandeja de Comité de Crédito 2
- Decisión final de Comité de Crédito 2
- Cambio de estado manual
- Reactivar a "pendiente"
- Actualizar etapa/estado/resultado (flujo manual y automático)
- Catálogo de etapas y resultados del workflow
- Historial del workflow de una solicitud
- Listado con filtros por etapa/resultado/estado
- Listado general de solicitudes (panel interno)
- Motivos de rechazo (catálogo parametrizable)
- Días de respuesta por etapa (SLA)
- Consulta de parámetros de días de respuesta
- Fecha estimada / real de respuesta comercial
- CRUD de estados del workflow

## 10. Condiciones Financieras y Carta de Vinculación
- CRUD de condiciones financieras
- Condiciones financieras por solicitud
- Registro de condiciones al aprobar (Comité 2)
- Notificar condiciones financieras al cliente
- CRUD de plantilla de Carta de Vinculación
- Generación de la Carta de Vinculación en PDF

## 11. Ampliación de Cupo
- CRUD de solicitudes de ampliación de cupo
- Ampliaciones por cliente
- Página de solicitud de ampliación de cupo

## 12. Consecutivos / Numeración
- CRUD de tipos de consecutivo
- CRUD de consecutivos
- Generación automática de número de solicitud
- Pantallas de administración de consecutivos

## 13. Notificaciones y Correos
- Plantillas de notificación (motor genérico)
- CRUD alterno de plantillas
- Alerta semanal de documentos por vencer
- Notificación de condiciones financieras
- Notificación de credenciales de usuario nuevo
- Correos por rol
- Formatos/plantillas de envío de correos

## 14. PQRS (Peticiones, Quejas, Reclamos, Sugerencias)
- Crear PQRS
- Catálogos de PQRS (tipos, estados)
- Listado según rol
- Detalle de una PQRS
- Actualizar/gestionar una PQRS
- Comentarios sobre una PQRS
- Historial de una PQRS
- Asignar responsable
- Bandeja de gestión
- Pendientes
- Mis PQRS (cliente)
- Aprobaciones de PQRS
- Reportes de PQRS
- Configuración de PQRS

## 15. Indicadores y Reportes
- Indicador de cumplimiento
- Línea de tiempo de una solicitud
- Detalle por área
- Dashboard de indicadores
- Indicadores por área
- Indicadores por solicitud

## 16. Pedidos
- Menú de Pedidos
- Pedidos faltantes
- Mis pedidos

## 17. Perfil y Sesión
- Mi perfil
- Cambiar contraseña
- Dashboard de bienvenida
- Página de inicio alterna
- Redirección raíz

## 18. Administración / Parametrización (panel general)
- Menú de Parametrización (punto de entrada a todos los módulos de configuración)

## 19. Integraciones Externas (incompleto)
- Integración "UNO" — stub/placeholder aún no implementado, probablemente para integración contable/ERP a futuro

---

### Notas
- `src/workflow/estados/estados.controller.ts` y `src/workflow/transiciones/transiciones.controller.ts` están vacíos — la lógica real del workflow vive en `solicitudes-workflow.service.ts` (documentada en `FLUJO_ETAPAS.md`).
- El dominio de roles/módulos está expuesto por tres superficies distintas (`/roles`, `/api/seguridad/roles`, `seguridad.controller.ts`), probablemente por evolución histórica del código — es una única funcionalidad de negocio aunque técnicamente esté triplicada.
- **"Tipo de solicitud" (auto-selección Cliente Nuevo / Ampliación de cupo, sección 6)** se identificaba correctamente por `fp_codigo = 'TIPO_SOLICITUD'` en un lugar, pero en otros tres (`SolicitudFormContent.tsx`, `PreguntaRenderer.tsx`) tenía el `fp_id=1171` de esa pregunta escrito directo en el código — ya corregido para usar `fp_codigo` en todos lados (2026-07-18). Importa junto con el **Versionamiento de formularios (sección 8)**: `crearNuevaVersion` clona cada pregunta como fila nueva con `fp_id` distinto, así que cualquier referencia a un `fp_id` fijo en vez de por `fp_codigo`/texto se rompe en silencio en cuanto se activa una versión nueva. Ver `Versionado-de-Formularios.md` para el detalle completo de esa auditoría.
- Se detectó (2026-07-18, solicitud `sol_id=2183`) un caso real de esa respuesta faltante en `Formulario_respuesta` pese a que el resto del formulario se guardó bien — no se confirmó la causa exacta (no reproducible en el momento, sin logs de esa sesión); comparado contra solicitudes anteriores (`2174`, `2175`) que sí la tienen guardada, no parece ser un fallo sistemático. Si se repite, reproducir en vivo para diagnosticar.
- **Historial de Solicitud con datos falsos (sección 9, pantalla del Ejecutivo de Negocios)**: `gestion-ejecutivo-negocios/[id]/registrar/page.tsx` armaba su propio arreglo `pasos` a mano en vez de consumir `obtenerHistorialWorkflow` como las demás pantallas de gestión — el paso "Concepto" quedaba siempre con la fecha de "ahora" y el usuario logueado, aparentando estar ya resuelto sin estarlo. Corregido 2026-07-21, ver `bug-historial-falso-registrar-concepto-ejecutivo.md`. No se auditaron las demás pantallas de gestión/registrar buscando el mismo patrón — revisar si se repite la queja en otra etapa.
