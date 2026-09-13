# "Centro de operación" en solicitudes: no se usa de verdad (2026-08-09)

## Resumen

Se preguntó qué implicaría dejar de manejar las solicitudes "por centro de
operación" (sucursal). Al auditar el código se encontró que, para las
solicitudes que crea un **cliente** desde el portal, ya es así en la
práctica: el campo existe en la base de datos porque es obligatorio ahí,
pero nadie lo elige ni depende de él para nada real. La única excepción
real es **Ampliación de Cupo** (creada por un Ejecutivo interno), que sí usa
un centro real — ver sección "Dónde SÍ importa" más abajo.

## Hallazgo principal: `co_id` hardcodeado a `1`

`FRONTEND/src/services/solicitudes.service.ts::guardarSolicitud` crea toda
solicitud nueva del cliente con:

```ts
const nuevaSolicitud = await this.create({
  cliente_id: clienteId,
  co_id: 1,          // <- fijo, siempre, sin preguntarle nada al cliente
  usuario_crea: usuarioId,
  estado_id: estado.id,
});
```

Confirmado contra datos en vivo (2026-08-09): de la única solicitud que
existe hoy en toda la base, `sol_co_id = 1` (`Centro_operacion.cop_id = 1`
= "PLANTA CARIBE (BQ)"; el otro centro real es `cop_id = 2` = "PLANTA
PACIFICO (VR)").

Existe un componente `FRONTEND/src/components/form/SolicitudForm.tsx` que
sí parece dejar elegir un `co_id` real, pero **no lo usa ninguna página** —
confirmado que no hay ningún `import` de ese archivo en el proyecto. Código
muerto.

## Dónde se confirmó que NO se usa

- **Listados internos** (`solicitudes-listados.service.ts::getSolicitudesConFiltros`,
  la que alimenta el listado real de Ejecutivo/ASC/OFC/Comités): no filtra
  por centro en ningún punto de su lógica de negocio real.
- **Permisos**: no hay ningún punto donde el centro asignado a un usuario
  determine qué solicitudes puede ver o gestionar.

## Dónde SÍ importa (no tocado hoy)

`ampliacion-cupo.service.ts::create` (Ejecutivo crea una Ampliación de Cupo
para un cliente existente) sí busca el centro real del cliente en
`Detalle_cliente_centro` y **lo exige**: si el cliente no tiene centro
asignado, lanza `Cliente ${id} no tiene centro de operación asignado`. Ese
`coId` real se usa para numerar la solicitud
(`sp_ObtenerSiguienteNumeroSolicitud @cop_id`). No se tocó esta lógica —
solo se le quitó el nombre del centro a la carpeta de Cloudinary (ver
`almacenamiento-de-archivos.md`).

## La numeración de solicitud YA es global, no por centro (corregido 2026-09-12)

Esta sección decía que `sp_ObtenerSiguienteNumeroSolicitud @cop_id` llevaba
un consecutivo independiente por centro. Verificado contra el código real:
eso ya no es así. La firma actual del SP
(`B_PortalClientes/db/migrations/create-sp-obtener-numero-solicitud.sql`) es
solo `@numero_solicitud OUTPUT` — **no recibe `@cop_id`**. Usa un único
consecutivo global en la tabla `Consecutivo` (`cons_ptc_id = 2`, tipo
`SOLICITUDES_VINCULACION`), compartido por todos los centros.

Ambos callers ya lo invocan sin `cop_id`:
`solicitudes.service.ts::obtenerSiguienteNumeroSolicitud` (línea ~1586) y
`ampliacion-cupo.service.ts::obtenerSiguienteNumeroSolicitud` (línea ~39).

Conclusión: si se decide quitar `centro_operacion` del todo de las
solicitudes, la numeración **no es un bloqueante** — ya no depende del
centro.

## Cambios aplicados hoy (2026-08-09)

1. **Filtro "Centro de operación" quitado** de las pantallas donde era
   engañoso (mostraba/filtraba por un dato que nunca varía):
   - `FRONTEND/src/app/solicitudes/indicadores/page.tsx`
   - `FRONTEND/src/app/solicitudes/indicadores/area/page.tsx`
   - `FRONTEND/src/app/solicitudes/listado-de-solicitudes/page.tsx`

   Se quitó el `<select>`, el estado (`coId`/`centros`), la carga de
   `centrosOperacionService`, y el parámetro `co_id` en las llamadas y en la
   URL. Se dejó la columna informativa `centro_operacion_nombre` en las
   tablas de resultados donde ya existía (no se pidió quitarla, y no rompe
   nada — solo muestra siempre el mismo valor hoy).

   Backend **no tocado**: `indicadores.service.ts` y
   `solicitudes-listados.service.ts` siguen aceptando `co_id` como filtro
   opcional (inofensivo, por si se vuelve a necesitar).

2. **Carpeta de Cloudinary ya no incluye el centro** — ver
   `almacenamiento-de-archivos.md` para el detalle completo (qué archivos,
   qué rutas antes/después).

## Pendiente / no decidido

- Qué hacer con la columna `sol_co_id` en la base de datos (dejarla con el
  `1` fijo sin que nadie la lea, o quitarla del todo — implicaría también
  decidir qué hacer con `Ampliación de Cupo`, que sí la necesita).
- Revisar `indicadores.service.ts` y `solicitudes-listados.service.ts`
  (backend) si en algún momento se quiere quitar también el soporte de
  `co_id` ahí, no solo el filtro visual.

## Bug crítico encontrado y corregido (2026-09-11): el login llamaba a una tabla inexistente

Al verificar contra la base de datos real (`db_ace277_leonardosanchez` en
`sql5111.site4now.net`, 144 tablas) se confirmó que **`usuarios_centros_operacion`
no existe** — ni con ese nombre ni con el que originalmente se creía correcto
(`usuarios_Centro_operacion`). La entidad TypeORM `usuarios-centros.entity.ts`
apunta a una tabla que nunca fue creada por ninguna migración del repo.

Esto no era solo el endpoint muerto que se pensaba: **`users.service.ts::getUserCentrosOperacion`
consulta esa misma tabla inexistente, y se llama directamente en el login**
(`auth.service.ts:348`, sin try/catch). Es decir, con esta base de datos
**cualquier login fallaría** con `Invalid object name 'usuarios_centros_operacion'`.

La tabla real y con datos vigentes es `Detalle_usuario_sucursal`
(`dusrs_id`, `usr_id`, `cop_id`, `dusrs_estado`, `dusrs_fecha_usr`,
`dusrs_usuario` — sin columna de "default" propia).

**Corregido:**
- `users.service.ts::getUserCentrosOperacion` — reescrito contra
  `Detalle_usuario_sucursal` filtrando `dusrs_estado = 'A'`; como no existe
  columna de default, se marca `es_default = true` en el primer registro
  (por `dusrs_id` ascendente). Verificado contra datos reales
  (`usr_id = 3` → dos centros, BQ y VR).
- `solicitudes-listados.service.ts::getSolicitudesPorEjecutivo` — el CTE
  `centros_usuario` también apuntaba a la tabla inexistente; corregido igual
  contra `Detalle_usuario_sucursal`. Este endpoint sigue sin caller en el
  frontend (`GET /solicitudes/por-centro-operacion` y `GET
  /solicitudes/por-ejecutivo` tampoco los llama ninguna pantalla), pero ya
  no revienta si algo llega a invocarlo.

## Eliminación completa de `sol_co_id` (2026-09-12)

Se decidió eliminar la columna del todo (la opción que quedó "pendiente" en
la sección de arriba), incluyendo el caso de Ampliación de Cupo. Resumen:

**Hallazgo adicional durante la verificación en vivo**: el SP real en la BD
(`sp_ObtenerSiguienteNumeroSolicitud`) **no coincidía con el `.sql` del
repo** (`db/migrations/create-sp-obtener-numero-solicitud.sql`, desactualizado
— no tiene `@cop_id` y devuelve un string con prefijo/año/mes). El SP real
sí tenía `@cop_id INT` y llevaba un consecutivo **separado por centro** en la
tabla `Consecutivo` (columna `cons_cop_id`): `cop_id=1` estaba en 35,
`cop_id=2` en 2 — confirma que la numeración por centro era real, no solo
teórica.

**Cambios de BD** (`migrations/20260912_eliminar_centro_operacion_de_solicitudes.sql`,
idempotente, ya aplicado en local):
1. Consolida `Consecutivo` a una sola fila por `ptc_id=2` con `cons_cop_id
   NULL` (mismo patrón que ya usa PQRS), arrancando en el máximo ya emitido
   (35) para no repetir números.
2. Reescribe `sp_ObtenerSiguienteNumeroSolicitud` sin `@cop_id` — consecutivo
   único global.
3. Quita el índice único compuesto `UQ_numero_solicitud_centro`
   (`sol_numero_solicitud`, `sol_co_id`) y la FK `FK_solicitudes_centro_operacion`,
   luego el `DROP COLUMN sol_co_id`, y crea `UQ_solicitudes_numero_solicitud`
   (solo sobre `sol_numero_solicitud`) como reemplazo.

**Backend** (ya no queda ninguna referencia a `sol_co_id`): `solicitudes.service.ts`
(crearSolicitud ya no exige/usa `co_id`, Festivos/días no hábiles se
consultan solo con `co_id IS NULL` — no había overrides reales en esas
tablas), `ampliacion-cupo.service.ts` (ya no busca el centro real del
cliente en `Detalle_cliente_centro` ni lo exige), `solicitudes-listados.service.ts`
(se borraron los endpoints muertos `getSolicitudesPorCentro`/`getSolicitudesPorEjecutivo`
y sus rutas `GET /solicitudes/por-centro-operacion` y `/por-ejecutivo`),
`solicitudes-documentos.service.ts`, `solicitudes-workflow.service.ts`,
`formulario-renderizable.service.ts`, `indicadores.service.ts` (ya no acepta
`co_id` como filtro), `notificaciones.service.ts`, `historial-workflow.service.ts`,
la entidad `SolicitudEntity` y 5 DTOs. De paso se encontró y corrigió un
8vo punto de subida a Cloudinary que el cleanup de carpetas del 2026-08-09
no había cubierto (`enviarCartaVinculacionPorCorreo` en
`solicitudes-workflow.service.ts` seguía armando la ruta con
`{centro_nombre}/cartas/...`).

Verificado en vivo contra una copia local de la BD (`db_acbbd1_sistemacomercial`,
SQL Server local): `POST /solicitudes` genera `numero_solicitud="36"`
(continúa el consecutivo consolidado en 35 correctamente) y `POST
/ampliacion-cupo` genera `"37"`, ambos sin pedir `co_id` ni centro real del
cliente. Los listados de gestión (`GET /solicitudes/listado`, `GET
/solicitudes/listado/:usuarioId`) responden sin `sol_co_id`/`centro_operacion_nombre`.

**Frontend — `co_id: 1` hardcodeado eliminado** de
`FRONTEND/src/services/solicitudes.service.ts::guardarSolicitud`.

## ⚠️ Pendiente crítico antes de deployar esto: 7 páginas de gestión interna quedan rotas

A diferencia de lo que decía la sección "Cambios aplicados hoy (2026-08-09)"
más arriba, **no todas las pantallas usaban el centro solo como columna
informativa**. Se encontró que en estas 7 páginas de `FRONTEND/src/app/solicitudes/`
el centro es el **filtro principal y obligatorio** de la búsqueda —no se
tocaron, a pedido del usuario, quedan pendientes para otra tarea—:

- `gestion-oficial-de-cumplimiento/page.tsx`
- `gestion-auxiliar-servicio-al-cliente/page.tsx`
- `gestion-comite-credito-1/page.tsx`
- `gestion-comite-credito-2/page.tsx`
- `gestion-ejecutivo-negocios/page.tsx`
- `rechazadas-ejecutivo/page.tsx`
- `corregir-formulario-asc/page.tsx`

Patrón en las 7: cargan `centrosOperacionService.getAll()`, auto-seleccionan
`user.co_id` (el centro real asignado al usuario interno vía
`Detalle_usuario_sucursal` — ese sí es un dato real, no vestigial), filtran
el listado de "Cliente" del buscador por ese centro
(`clientesService.getAll()` + `centro_operacion_ids.includes(centroSeleccionado)`),
y **filtran los resultados de la búsqueda por `s.sol_co_id === centroSeleccionado`**.

**Por qué esto rompe con el backend ya cambiado**: `sol_co_id` ya no existe
en la respuesta del backend (siempre `undefined`), así que ese filtro nunca
hace match — en cuanto el usuario interno tenga un centro preseleccionado
(que es automático, viene de su propio `user.co_id`) y presione "Buscar",
**la lista de resultados sale vacía siempre**. Esto rompería la bandeja de
trabajo real de Oficial de Cumplimiento, Auxiliar Servicio Cliente, Comités
1 y 2, Ejecutivo de Negocios, y las dos pantallas de rechazos/corrección.

**No deployar el backend de esta rama a producción sin arreglar antes estas
7 pantallas** (quitar el filtro/columna de centro, y decidir cómo debe
cargar el buscador de "Cliente" sin poder filtrar por centro primero —
pendiente de decisión de producto, no solo de código).

También quedan, con menor urgencia (son solo texto de solo lectura, con
fallback a `"-"` o `"N/A"` — no rompen nada, solo mostrarán ese fallback):
`solicitudes/[id]/detalle/page.tsx`, `rechazadas-ejecutivo/[id]/page.tsx`,
`listado-documentos/page.tsx`, `mis-documentos-vencidos/page.tsx`,
`solicitud-ampliacion-cupo/page.tsx`, y las páginas `[id]/gestionar` /
`[id]/registrar` de las 7 de arriba.

**Pendiente de decidir:** el módulo `usuarios/` (`usuario.service.ts`,
`usuario.controller.ts`, endpoints `/usuarios/:userId/centros*`) sigue
completo contra la tabla inexistente `usuarios_centros_operacion` — no se
tocó porque implica decidir si ese CRUD "nuevo" (con soporte explícito de
default) se migra también a `Detalle_usuario_sucursal`, o si se crea de
verdad la tabla `usuarios_centros_operacion` con una migración. Mientras
tanto, cualquier pantalla que use esos endpoints (`UsuarioCentrosModal.tsx`
en el frontend) fallará igual con "Invalid object name".
