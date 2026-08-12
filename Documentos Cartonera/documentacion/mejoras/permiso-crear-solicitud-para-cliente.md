# Pendiente: permiso granular para "crear solicitud a nombre de un cliente"

Estado: **no implementado**. Documentado el 2026-08-03 al agregar la
funcionalidad de que un usuario interno (Ejecutivo, Admin, etc.) pueda
diligenciar `/solicitudes/nueva` en nombre de un cliente (ver
`FRONTEND/src/app/solicitudes/nueva/page.tsx` y
`BACKEND/src/solicitudes/solicitudes.controller.ts::crearSolicitud`).

## Cómo quedó (a propósito, temporal)

Hoy la única distinción es "es CLIENTE" vs "no es CLIENTE":

- **Backend** (`solicitudes.controller.ts::crearSolicitud`): el guard de
  ownership solo bloquea si `req.user.rol === 'CLIENTE'` y el `cliente_id`
  del body no es el suyo. Cualquier rol interno (`EJECUTIVO`, `ADMIN`,
  `COMERCIAL`, `ADMINISTRACION`, y también `ASC`, `OC`, `CC1`, `CC2` — estos
  últimos sin ninguna razón de negocio clara para hacerlo) puede crear una
  solicitud para cualquier `cliente_id`.
- **Frontend** (`page.tsx`): el selector de cliente se muestra a cualquier
  usuario cuyo rol no sea `CLIENTE` (variable `esCliente`).

Es decir: "quién puede crear a nombre de otro" está **hardcodeado como "todo
el que no sea cliente"**, no como una lista de roles ni como un permiso
consultable.

## Por qué no usar una whitelist de roles hardcodeada

Cambiar quién tiene este permiso hoy significa editar código en dos repos y
hacer un deploy. Y aunque se hiciera con una whitelist (`['EJECUTIVO',
'ADMIN'].includes(rol)`), sigue siendo frágil: agregar un rol nuevo en el
futuro obliga a acordarse de tocar esta lista en particular.

## Opción recomendada: reusar `pc_modulos` / `pc_rol_modulo`

El proyecto ya tiene un sistema de permisos por rol 100% data-driven, hoy
usado solo para el menú — ver
[`menu-dinamico-pc-modulos.md`](../menu-dinamico-pc-modulos.md). Es la pieza
natural para esto: en vez de código, la asignación de quién puede crear a
nombre de un cliente queda en filas de `pc_rol_modulo`, editable sin deploy.

**Importante: no reusar el `rm_crear` del módulo "Solicitudes" que ya
exista.** Ese flag hoy (si existe) significa "puede crear su propia
solicitud", que es un permiso distinto de "puede crear una solicitud a
nombre de otro cliente". Conflatearlos haría que cualquier rol nuevo al que
se le dé el primero herede el segundo sin que nadie lo haya decidido
explícitamente.

Diseño propuesto:

1. Módulo nuevo en `pc_modulos`, ej. `mod_ruta = '/solicitudes/nueva/para-cliente'`
   (no necesita aparecer en el menú — puede ir con las filas de
   `pc_rol_modulo` pero sin necesidad de mostrarlo como link; o, si se
   prefiere, colgarlo como hijo de un módulo "Solicitudes" existente).
2. Fila en `pc_rol_modulo` con `rm_crear = 1` (o cualquier bit que se decida
   usar como "permitido") solo para los roles que deban tenerlo — siguiendo
   el patrón idempotente `IF NOT EXISTS (...) BEGIN INSERT ... END ELSE
   BEGIN UPDATE ... END` de las migraciones ya existentes (ver
   `migrations/20260721_crear_modulos_consultas.sql` como plantilla).
3. Backend: en `crearSolicitud`, antes de crear la solicitud, si
   `req.user.rol !== 'CLIENTE'` y `dto.cliente_id !== propioClienteId`,
   consultar si el rol tiene el permiso en ese módulo (mismo tipo de query
   que ya hace `ModulosService.findByRol`) y lanzar `ForbiddenException` si
   no lo tiene. Este es el gate real — el único que importa para seguridad.
4. Frontend: `page.tsx` consulta el mismo permiso (ya sea reusando
   `GET /seguridad/modulos/por-rol` o un endpoint dedicado) para decidir si
   muestra el selector de cliente o un mensaje de "no autorizado". Esto es
   solo UX — nunca reemplaza el chequeo del punto 3.

## Nota aparte: alcance por Ejecutivo

Ya existe una restricción distinta y ortogonal a ésta: un `EJECUTIVO` solo
debería poder crear solicitudes para *sus propios* clientes (`ejng_id`).
Hoy eso solo se filtra en el frontend (lista de clientes del selector); el
backend no lo valida — ver la nota "Explícitamente fuera de alcance" en el
plan original de esta funcionalidad. Si se implementa el permiso granular
de arriba, conviene resolver esto en el mismo esfuerzo (consulta extra:
`cliente.ejng_id === req.user.ejng_id` cuando el rol es `EJECUTIVO`).
