# Migración inicial de clientes ya existentes en SIESA

Idea pendiente (no implementada) — diseño conversado con el usuario el
2026-07-14, guardado para retomar cuando haya acceso real a SIESA.

## Contexto

Los datos de las solicitudes de este portal terminan yendo a SIESA (sistema
contable/ERP externo — ver `BACKEND/src/integraciones/uno/`, hoy un stub
completamente vacío: `uno.service.ts`, `uno.module.ts`,
`entities/integracion-uno.entity.ts` y `retry.job.ts` no tienen ninguna
lógica, y `UnoModule` ni siquiera está importado en `app.module.ts`).

El problema: hay clientes que **ya existen y ya están aprobados en SIESA**
desde antes de que existiera este portal. No tendría sentido hacerlos pasar
por las 5 etapas de aprobación (Ejecutivo → Auxiliar → Oficial de
Cumplimiento → Comité 1 → Comité 2) como si fueran prospectos nuevos — ya
fueron aprobados en el mundo real. Se necesita un proceso que los migre
automáticamente, consultando SIESA, en vez de llenar un formulario manual
por cada uno.

**Acceso a SIESA**: todavía no resuelto — el usuario eventualmente va a
tener acceso, pero el mecanismo exacto (BD directa, API, archivo) no está
decidido aún. Sí hay evidencia de que el acceso por **base de datos
directa** es viable: `C:\Users\Dynabook\Downloads\1. Consulta de Pedido por
Item.sql` es un query real contra SIESA (consulta de pedidos por ítem, no
de clientes/cupo) que usa la convención de tablas propia de SIESA
(`t200_mm_terceros` = terceros, `t201_mm_clientes` = extensión de cliente
sobre un tercero, `t430_cm_pv_docto`/`t431_cm_pv_movto` = documentos/movimientos
de venta, etc.). Cuando se retome esto, probablemente la tabla de clientes
y cupo esté en `t200_mm_terceros`/`t201_mm_clientes` o similares — hay que
pedir/armar la consulta equivalente para maestro de cliente + cupo
aprobado, no asumir que es la misma consulta de este archivo.

## Diseño acordado

### 1. Disparo: job programado, no manual

Se piensa como un proceso automático recurrente (no algo que alguien
dispare a mano cada vez) — el stub vacío `retry.job.ts` ya sugiere que
originalmente se había pensado en un job con reintentos para esto mismo.
Encaja como el punto de partida real para implementar la integración
`uno` en vez de dejarla vacía.

### 2. Por cada cliente que traiga la consulta a SIESA

- Buscar si ya existe en `Clientes` por NIT (`cli_nro_identificacion`).
  - No existe → crearlo (mismo mecanismo que `ClientesService.create()`).
  - Ya existe → revisar si ya tiene una solicitud "migrada" antes de crear
    una nueva, para que el job sea **idempotente** (no duplicar en cada
    corrida).

### 3. Crear la solicitud ya aprobada, sin pasar por el workflow

Igual que ya se hace en `BACKEND/src/ampliacion-cupo/ampliacion-cupo.service.ts`
(inserta una solicitud saltándose etapas): `INSERT` directo en `solicitudes`
con:
- `sol_estado_id = 5` (APROBADA, tabla real `solicitud_estados` — ver
  `documentacion/FLUJO_ETAPAS.md`)
- `sol_etapa_actual_id` = CC2, `sol_resultado_etapa_id` = APROBADO
- `sol_cupo_aprobado` / `sol_plazo_pago` / `sol_forma_pago` ya poblados con
  lo que traiga SIESA

### 4. Dejar rastro de que fue migración, no aprobación real

Preocupación explícita del usuario: que no quede como si un humano hubiera
revisado/aprobado esa solicitud paso a paso en este sistema. Dos cosas:

- Insertar igual una fila en `solicitud_workflow_historial` (con un
  comentario tipo "Migrado desde SIESA" en `swh_comentario`), para que
  quede un registro aunque sea sintético.
- Agregar una columna nueva para diferenciar el origen, ej.
  `sol_origen` (`'MIGRACION_SIESA'` vs `'PORTAL'`, o el valor que se
  decida) — no existe hoy, requeriría su propia migración de esquema.

### 5. Manejo de fallos por cliente, no por lote completo

Si consultar/crear un cliente puntual falla, no debe tumbar todo el batch
— registrar cuáles fallaron para reintentar después (para esto ya estaba
pensado `retry.job.ts`).

## Variables necesarias (verificado contra columnas reales NOT NULL de `Clientes`/`solicitudes`)

### Deberían venir de SIESA, por cliente

| Variable del portal | Qué es | Nota |
|---|---|---|
| `cli_nro_identificacion` | NIT | Clave de matching para no duplicar |
| `cli_tipo_identificacion` | Tipo de doc. (NIT/CC/etc) | Catálogo propio del portal — mapear código SIESA → id del portal |
| `cli_razon_social` | Razón social | — |
| `cli_direccion` | Dirección | — |
| `cli_correo` | Correo | Solo importa si se habilita acceso al portal |
| `pai_id` / `dpto_id` / `ciu_id` | País/depto/ciudad | SIESA lo maneja como ciudad (`t013_mm_ciudades`) — mapear a catálogos del portal. Ojo con el bug ya conocido del catálogo geográfico propio (`fp_id` 1154/1155/1156) antes de depender de este mapeo |
| `ejng_id` | Ejecutivo de negocio asignado | En SIESA sería el "vendedor" (tercero vendedor) — mapear vendedor SIESA → `ejng_id` del portal |
| `sol_co_id` / centro de operación | Centro de operación | En SIESA podría salir de compañía/sucursal — mapear |
| `sol_cupo_aprobado` | Cupo de crédito | Dato comercial clásico de SIESA |
| `sol_plazo_pago` | Plazo de pago | — |
| `sol_forma_pago` | Forma de pago | — |
| `sol_es_zona_franca` | Zona franca | Si SIESA lo distingue |

### NO vienen de SIESA — se generan o se deciden en el portal

| Variable | Qué se hace hoy (cliente/solicitud manual) | Decisión para migración |
|---|---|---|
| `cli_porcentaje_entrega`, `cli_tonelada_objetivo` | Se ponen en 0 | ¿Igual, o SIESA tiene equivalente? |
| `cli_estado_aprobacion` | Se pone `'P'` al crear | Para un cliente ya aprobado probablemente otro valor (ej. `'A'`) — a decidir |
| `cli_estado` | `'A'` | Igual |
| `cli_acceso_portal_clientes` / `cli_password` | Se genera random si se habilita | Pendiente ya anotado arriba: ¿habilitado de una vez o no? |
| `sol_estado_id`/`sol_etapa_actual_id`/`sol_resultado_etapa_id` | — | Fijos: 5 (APROBADA) / CC2 / APROBADO |
| `sol_numero_solicitud` | `sp_ObtenerSiguienteNumeroSolicitud` | Igual, mismo mecanismo que ya usa `ampliacion-cupo` |
| `sol_version`, `sol_formulario_version` | 1 / versión activa del formulario | Igual |
| `sol_fecha_creacion` | `now()` | ¿Fecha de la migración, o la fecha real de aprobación en SIESA si existe? Decidir |
| `sol_origen` (propuesto, no existe aún) | — | Fijo: `'MIGRACION_SIESA'` |

## Pendiente / fuera de alcance de este documento

- Mecanismo real de acceso a SIESA (BD directa vs API vs archivo) — no
  decidido, bloquea empezar a implementar.
- Consulta exacta en SIESA para maestro de cliente + cupo aprobado (no es
  la misma que `1. Consulta de Pedido por Item.sql`, esa es de pedidos).
- Si los clientes recién migrados deben quedar con acceso al portal
  (`cli_acceso_portal_clientes`) habilitado de una vez, o inhabilitado
  hasta que alguien lo active manualmente.
- Nombre y valores exactos de la columna `sol_origen` (o el mecanismo que
  se use para marcar el origen).
