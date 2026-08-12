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

## La numeración de solicitud es por centro (consecutivo independiente)

`sp_ObtenerSiguienteNumeroSolicitud @cop_id` (stored procedure en SQL
Server) lleva un consecutivo **independiente por centro** — dos centros
pueden tener ambos una "solicitud #45" al mismo tiempo. Como en la práctica
casi todo pasa con `co_id = 1` (la única excepción es Ampliación de Cupo si
el cliente tuviera centro 2 asignado), hoy es de facto un solo contador. Si
algún día se quita `centro_operacion` del todo, esto habría que
revisarlo — no se tocó hoy.

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

## Bonus: dos endpoints muertos, uno con bug real (no corregido)

Encontrado de pasada, sin relación directa con lo de arriba — anotado para
no perderlo:

- `GET /solicitudes/por-centro-operacion` y `GET /solicitudes/por-ejecutivo`
  (`solicitudes.controller.ts`) no los llama ninguna pantalla del frontend
  (`solicitudesService.getPorCentro`/`getPorEjecutivo` no tienen ningún
  caller). Código muerto pero alcanzable por URL directa.
- `solicitudes-listados.service.ts::getSolicitudesPorEjecutivo` consulta una
  tabla `usuarios_Centro_operacion` que **no existe** en la base — la tabla
  real se llama `Detalle_usuario_sucursal`. Si alguna vez algo llega a
  llamar ese endpoint, revienta con "Invalid object name". No corregido
  (nadie lo usa hoy).
