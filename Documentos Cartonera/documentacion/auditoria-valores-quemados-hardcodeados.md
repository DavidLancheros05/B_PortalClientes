# Auditoría de valores quemados (hardcodeados) — backend y frontend

> Pedido por el usuario ("¿puedes mirar dónde hay cosas quemadas?"), alcance elegido: toda la app, ambos repos. Generado 2026-08-02 con un barrido de `B_PortalClientes/src` y `F_PortalClientes/src` completos (no solo el módulo de formularios). Es un **listado de hallazgos, no un trabajo de corrección** — los bugs #1 y #2 se investigaron y confirmaron en profundidad (contra la base de datos en vivo y trazando quién llama a quién); el resto son hallazgos de lectura de código sin verificar en vivo uno por uno.

## Causa raíz común a los bugs #1 y #2

`solicitud_estados` es el catálogo real: `1=BORRADOR, 2=PENDIENTE, 3=REVISION, 4=COMPLETADA (genérico, casi sin uso), 5=APROBADA, 6=RECHAZADA` (confirmado en vivo vía `db-query.mjs`). Varias partes del código (la mayoría) resuelven estos IDs consultando la tabla por `ses_codigo` — es el patrón correcto, ya usado en `solicitudes-workflow.service.ts::guardarConceptoGenerico` y en otros ~10 puntos del mismo archivo. Pero al menos dos módulos fueron escritos asumiendo un modelo más simple de 4 estados (`1=pendiente, 2=revisión, 3=aprobada, 4=rechazada`, sin `BORRADOR` ni el split `COMPLETADA`/`APROBADA`/`RECHAZADA`) y quedaron con esa numeración quemada sin actualizar cuando el catálogo real se estabilizó. Es el mismo error de fondo en dos lugares independientes — no se copiaron entre sí, cada uno lo escribió por separado con la misma suposición equivocada.

## 1. [CORREGIDO 2026-08-02] Bug confirmado y en vivo: el dashboard de indicadores mostraba "Aprobadas"/"Rechazadas" que no eran eso

**Archivo:** `B_PortalClientes/src/indicadores/indicadores.service.ts:78-80` (`queryResumen`) y `:462-463` (`queryPorMes`). Consumido por `GET /indicadores` desde `F_PortalClientes/src/app/solicitudes/indicadores/page.tsx` — accesible desde el menú (`Header.tsx`), con tiles "Aprobadas"/"Rechazadas" (líneas 442, 457) y una gráfica de tendencia de 6 meses (líneas 335-336, 553-558).

```sql
SUM(CASE WHEN sol_estado_id = 3 THEN 1 ELSE 0 END) AS aprobadas,   -- 3 = REVISION, no aprobada
SUM(CASE WHEN sol_estado_id = 4 THEN 1 ELSE 0 END) AS rechazadas,  -- 4 = COMPLETADA (genérico), no rechazada
```

Esto es una consulta **`GET` de solo lectura, disparada cada vez que alguien abre la página** — a diferencia de un bug que depende de una acción puntual, este se ve cada vez que un gerente/ejecutivo revisa el dashboard. El efecto concreto: el tile "Aprobadas" mostraba el conteo de solicitudes **en revisión** (el número más alto y más volátil del pipeline, no aprobaciones reales), y "Rechazadas" mostraba el conteo de estado `COMPLETADA` (genérico, casi no se usa) — casi siempre cercano a 0. Las aprobaciones y rechazos **reales** (estados 5 y 6) no se contaban en ninguna de las dos categorías, así que tampoco aparecían en otro lado del resumen: quedaban invisibles. Lectura más probable para quien miraba el dashboard: "casi nada se rechaza y hay muchas aprobadas", cuando en realidad era "hay mucho en revisión y no sabemos cuántas se aprueban o rechazan de verdad".

### Fix aplicado y verificado

Se reemplazaron ambas queries (`queryResumen` y `queryPorMes`) en `indicadores.service.ts` por un `JOIN` a `solicitud_estados` filtrando por `se.ses_codigo` en vez de comparar `sol_estado_id` contra números quemados (ver SQL propuesto más abajo, aplicado tal cual). `npx tsc --noEmit` limpio. Verificado en vivo contra la base compartida, comparando el resultado viejo vs. el nuevo sobre los mismos datos:

| | antes (bug) | después (fix) |
|---|---|---|
| Aprobadas | 1 (en realidad solicitudes en REVISION) | 3 (aprobadas reales, `ses_codigo='APROBADA'`) |
| Rechazadas | 0 | 0 (coincide — no hay rechazadas reales hoy) |
| Pendientes | no se veía como categoría propia | 1 (PENDIENTE + REVISION) |

No se probó visualmente en el navegador (el contrato de campos que devuelve la API no cambió — `resumen.aprobadas`/`resumen.rechazadas`/`por_mes[].aprobadas`/`por_mes[].rechazadas` siguen igual — así que el frontend no necesita cambios), pero recomendable confirmar una vez que corra el backend.

## 2. [CORREGIDO 2026-08-02] Bug confirmado, pero no disparado por el flujo normal: emails de estado con contenido incorrecto

**Archivos:** `notificaciones.service.ts:358-365` (`getEstadoLabel`) y `:636-659` (`notificarEstadoSolicitud`), disparado desde `solicitudes-workflow.service.ts:425` dentro de `cambiarEstado()`, expuesto en `PATCH /solicitudes/:id/estado` (`solicitudes.controller.ts:1115-1124`, solo protegido por `JwtAuthGuard` — cualquier usuario autenticado, sin importar el rol, puede llamarlo). Además, mismo patrón en `solicitudes.controller.ts:260-263` (`estadisticasCliente`, endpoint `GET /solicitudes/cliente/:clienteId/estadisticas`).

Mismo tipo de mapeo quemado y desfasado que el bug #1, con `if (estadoId === 3 || estadoId === 4)` disparando el correo "Tu solicitud fue aprobada"/"...rechazada" para los estados REVISION/COMPLETADA en vez de APROBADA/RECHAZADA, y `estadisticasCliente` contando `completadas` como `sol_estado_id === 4` en vez de 5.

### Impacto real rastreado (por qué es distinto del bug #1)

Se rastreó **cada** caller de ambos endpoints en el frontend, con estos resultados:

- `solicitudesService.cambiarEstado()` (`F_PortalClientes/src/services/solicitudes.service.ts:67`) es el único consumidor de `PATCH /solicitudes/:id/estado`, y sus **dos únicos call sites** (líneas 505 y 523) mandan siempre `ESTADO_SOLICITUD.PENDIENTE.id` (2) — nunca 3 ni 4. Las transiciones reales a REVISION/APROBADA/RECHAZADA las hace `guardarConceptoGenerico` (mismo archivo backend, línea 955) y `aprobarRechazarSolicitud` (rechazo de ASC, línea ~789), que **sí** resuelven los IDs correctamente por `ses_codigo` y **no** pasan por `cambiarEstado`/`notificarEstadoSolicitud`. Esas dos funciones ya tienen sus propias notificaciones correctas al cliente: `enviarCartaVinculacionPorCorreo` (aprobación real en CC2, con la Carta de Vinculación) y `notificarRechazoSolicitud` (rechazo de ASC, con motivo y documentos faltantes).
- `estadisticasCliente` no tiene **ningún** consumidor en el frontend (`grep -r "estadisticas" F_PortalClientes/src` no encuentra nada) — es código muerto desde el punto de vista de la UI.

Conclusión: **ninguna de las dos rutas se ejecuta hoy en el flujo normal de la app.** Es una bomba de tiempo (código alcanzable, sin guard de rol en el primer caso, con lógica incorrecta) — no un incendio activo como el bug #1. También reveló que `if (estadoId === 3 || estadoId === 4)` en `cambiarEstado()` es en realidad **código vestigial**: el resto de esa misma función solo tiene ramas de negocio para `estadoId 1` (BORRADOR) y `2` (PENDIENTE) — el comentario en la línea 318 dice literalmente "Para estados 3+ (REVISIÓN, COMPLETADA), no cambiamos la etapa", es decir, `cambiarEstado` nunca fue pensado para mover una solicitud a REVISION/APROBADA/RECHAZADA de verdad (esas transiciones necesitan cambiar de etapa de workflow también, algo que esta función no hace para estados ≥3). Todo indica que esta rama de notificación es un resto de una implementación más simple y anterior a que existiera `guardarConceptoGenerico`, nunca retirada.

### Fix aplicado y verificado

Se corrigieron los tres puntos con el mismo patrón que el bug #1 (resolver por `ses_codigo`/`ses_id` real en vez de comparar contra números quemados):

- **`notificaciones.service.ts`**: `getEstadoLabel` (switch quemado) se reemplazó por `getEstadoInfo`, que consulta `SELECT ses_codigo, ses_nombre FROM solicitud_estados WHERE ses_id = @0` — el nombre de estado que ve el cliente ahora sale directo de la BD, no de una copia hardcodeada. `notificarEstadoSolicitud` decide el texto de `detalle_estado` comparando `estadoInfo.codigo === 'APROBADA'`/`'RECHAZADA'` en vez de `estadoId === 3`/`4`.
- **`solicitudes-workflow.service.ts:425`**: la condición que dispara el correo ahora resuelve `estadoAprobada`/`estadoRechazada` vía `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'APROBADA'/'RECHAZADA'` (mismo patrón ya usado en `guardarConceptoGenerico`) y compara `estadoId` contra esos IDs reales, no contra `3`/`4`.
- **`solicitudes.controller.ts::estadisticasCliente`**: se reemplazó `completadas: ... sol_estado_id === 4` por `aprobadas: ... sol_estado_id === 5` y se agregó `rechazadas: ... sol_estado_id === 6` (antes no existía esa categoría) — se pudo renombrar el campo de la respuesta sin romper nada porque no tiene consumidores.

`npx tsc --noEmit` limpio en los tres archivos. Verificado en vivo contra la base compartida que `ses_codigo='APROBADA'` resuelve a `ses_id=5` y `'RECHAZADA'` a `6` (los IDs que ahora usa el código, no los `3`/`4` de antes). No se probó el envío real de un correo (requeriría forzar una transición real a estado 5/6 vía `cambiarEstado`, que hoy nada dispara) ni el uso del endpoint de estadísticas en el navegador, porque ninguno de los dos tiene un caller real hoy.

### Soluciones de fondo consideradas (no aplicadas, quedan como decisión futura)

1. **[APLICADO 2026-08-02] Retirar la rama vestigial de `cambiarEstado()` en vez de solo corregirla.** Ver detalle completo más abajo.
2. **[APLICADO 2026-08-02] Centralizar la resolución de `solicitud_estados` en un solo servicio cacheado.** Ver detalle completo más abajo.
3. **[APLICADO PARCIALMENTE 2026-08-02] Espejo del problema en el frontend.** Ver detalle completo más abajo — se aplicó la mitad de bajo riesgo (endpoint nuevo + unificar los dos catálogos estáticos), no la migración completa a fetch en vivo (evaluada y descartada por alcance/riesgo, ver detalle).

### Detalle de la centralización aplicada (solución de fondo #2)

Se creó `SolicitudEstadosService` (`B_PortalClientes/src/common/solicitud-estados/solicitud-estados.service.ts`), siguiendo el mismo patrón de nombres que `WorkflowService.obtenerEtapaPorCodigo`/`obtenerResultadoPorCodigo` (`src/solicitudes/workflow.service.ts`) ya usado en el resto del código, para que los tres catálogos de workflow (`solicitud_estados`, `workflow_etapas`, `workflow_estado_etapa`) se resuelvan de forma consistente:

- `obtenerEstadoPorCodigo(codigo)` / `obtenerEstadoPorId(id)`, ambos cacheados en memoria (carga las 6 filas de `solicitud_estados` una sola vez, no en cada llamada — a diferencia de `WorkflowService`, que sí golpea la BD en cada invocación; se justifica acá porque algunos métodos hacen 2-3 lookups en la misma request).
- Módulo nuevo `SolicitudEstadosModule` (`src/common/solicitud-estados/solicitud-estados.module.ts`), mismo patrón que `common/storage/storage.module.ts` — sin dependencias propias, importado por `SolicitudesModule` (que es el único que termina necesitándolo, ver más abajo por qué `NotificacionesModule` no lo importa).

**Se migraron los 8 puntos que hacían su propio `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = '...'` como lookup aislado** (los que ya usaban `JOIN`/subquery inline dentro de una consulta SQL más grande — `indicadores.service.ts`, `solicitudes-listados.service.ts:396`, `solicitudes-documentos.service.ts:266` — se dejaron igual porque ya resuelven por `ses_codigo`, no por número quemado, y migrarlos habría significado reescribir consultas SQL más complejas sin beneficio real):

- `solicitudes-workflow.service.ts`: `cambiarEstado` (el fix del bug #2), `aprobarRechazarSolicitud`, `guardarGestionEjecutivo`, `guardarConceptoGenerico` (3 lookups), `finalizarGestionRechazo`, `guardarRevisionComiteCredito1`, `actualizarEstadoFlujoAutomatico` — 7 métodos, 9 lookups en total.
- `notificaciones.service.ts::getEstadoInfo` migró primero al servicio cacheado, y después se eliminó por completo junto con `notificarEstadoSolicitud` al aplicar la solución de fondo #1 (ver debajo) — por eso `NotificacionesModule` ya no importa `SolicitudEstadosModule`, quedó sin ningún uso ahí.

`npx tsc --noEmit` limpio. Se verificó que el wiring de NestJS no tiene dependencias circulares reiniciando el backend real (`Nest application successfully started` sin errores), y se confirmó en vivo, con el backend recompilado, que los dos endpoints ya corregidos siguen devolviendo los valores correctos después del refactor: `GET /solicitudes/cliente/13606/estadisticas` → `{"aprobadas":1,"rechazadas":0,...}`, `GET /indicadores/cumplimiento` → `{"aprobadas":3,"rechazadas":0,"pendientes":1,...}` — mismos números que antes de centralizar, confirmando que el refactor no cambió comportamiento, solo la fuente de los IDs.

**Incidente durante la verificación (para no repetirlo):** al buscar el proceso del backend para reiniciarlo, se mató por error el proceso del puerto 3001 asumiendo que era Cartonera colgada (siguiendo el quirk documentado en `CLAUDE.md`, que menciona ese puerto) — pero `.env` tiene `PORT=3003`, y el proceso de 3001 no tenía ninguna relación con este repo (probablemente la "otra app" ya anotada en memoria). Se corrigió el snippet de `CLAUDE.md` para leer el puerto de `.env` en vez de asumir 3001.

### Detalle de "retirar la rama vestigial" aplicado (solución de fondo #1)

En `solicitudes-workflow.service.ts::cambiarEstado`, se quitó la rama `if (estadoId === estadoAprobada?.id || estadoId === estadoRechazada?.id) { notificarEstadoSolicitud(...) }` (la que se había corregido para el bug #2) y se dejó solo la notificación de transición a PENDIENTE, que sí es real. Se agregó un comentario explicando por qué se retiró en vez de solo corregirse (nunca alcanzada por el flujo real; habría duplicado el correo de `guardarConceptoGenerico`/`aprobarRechazarSolicitud` si algún día se disparaba).

Como consecuencia, `notificarEstadoSolicitud` y `getEstadoInfo` (`notificaciones.service.ts`) se quedaron sin ningún caller — se eliminaron los dos métodos completos, y con ellos la inyección de `SolicitudEstadosService` en `NotificacionesService`/`NotificacionesModule` (ya no la necesitaba). **No se tocó** la plantilla de correo `SOLICITUD_ESTADO_CLIENTE` que queda seedeada en la base (tanto en el seed de `notificaciones.service.ts` como en un seed independiente y duplicado de `parametrizacion/notificaciones/notificaciones.service.ts` — hallazgo nuevo, no corregido) — queda como una fila de plantilla sin ningún código que la dispare, dato huérfano de bajo riesgo, fuera del alcance de este cambio.

`npx tsc --noEmit` limpio tras la eliminación. Verificado en vivo: el backend reinició sin errores de DI (confirma que ningún otro punto dependía de los métodos eliminados) y los dos endpoints de los bugs #1/#2 siguen devolviendo los mismos valores correctos.

### Detalle de "espejo en el frontend" aplicado parcialmente (solución de fondo #3)

Se evaluó el alcance completo (fetch en vivo del catálogo, reemplazando los ~15 lugares del frontend que hoy importan `ESTADO_SOLICITUD`/`ESTADOS` como constantes estáticas y síncronas) y se descartó por ahora: significaría convertir varios componentes a manejar datos async (loading state, fetch-once-cache compartido) solo para dejar de tener un número quemado — riesgo real de romper algo visual a cambio de un beneficio marginal, porque el catálogo real casi no cambia. Se aplicó la parte de bajo riesgo, que sí ataca la causa de fondo (dos catálogos que podían decir cosas distintas) sin tocar ningún componente:

- **Backend**: nuevo endpoint de solo lectura `GET /parametrizacion/solicitud-estados` (`SolicitudEstadosController`, mismo módulo `common/solicitud-estados/`), protegido con `JwtAuthGuard` igual que el resto de `/parametrizacion/*`. Expone `SolicitudEstadosService.obtenerTodos()` (nuevo método, reusa el cache existente). Verificado en vivo: devuelve las 6 filas reales (`BORRADOR`..`RECHAZADA`) con el backend recompilado sin errores de DI.
- **Frontend**: `lib/workflow-labels.ts::ESTADOS` (uno de los dos catálogos que competían) dejó de tener su propia copia hardcodeada de los IDs 1-6 y ahora se **deriva** de `constants/estado-solicitud.ts::ESTADO_SOLICITUD_POR_ID` (el catálogo que sí coincide 1:1 con la tabla real). El texto visible que ya mostraban las ~8 páginas que usan `ESTADOS`/`getEstadoLabel` **no cambió** — se preservó explícitamente vía un `LABEL_OVERRIDES` para el único caso donde los dos catálogos decían algo distinto (`3: "Revisión"` acá vs. `"En revisión"` en el catálogo canónico); el resto de labels ya coincidían texto por texto. El caso `0: "Sin iniciar"` (que no existe en la tabla real, es puramente defensivo del lado UI) se dejó igual. `npx tsc --noEmit` limpio en el frontend.
- **No se creó** un servicio frontend que consuma el endpoint nuevo — hoy nada lo llama desde `F_PortalClientes`. Queda ahí disponible para cuando se decida encarar la migración completa a fetch en vivo (o para una pantalla de administración de estados, si alguna vez hace falta editar el catálogo desde la UI en vez de directo en BD).

No se verificó visualmente en el navegador (requeriría credenciales de sesión reales contra rutas protegidas) — sí se confirmó que el valor que produce `ESTADOS` en runtime es idéntico al de antes del cambio (mismo texto para los 7 keys 0-6), razonado a mano contra el contenido de `estado-solicitud.ts`.

### Segunda vuelta: eliminar los números quemados restantes de estado/etapa/resultado (2026-08-02, sesión posterior)

El usuario pidió ir más a fondo pero sin arriesgar nada — se optó por eliminar los números mágicos restantes usando las constantes ya correctas (`ESTADO_SOLICITUD`) más dos constantes nuevas del mismo patrón para etapa/resultado, **sin** tocar el enfoque de fetch en vivo (descartado arriba por alcance/riesgo). Antes de tocar nada se confirmaron en vivo los catálogos reales `workflow_etapas` (`1=CLI, 2=EJN, 3=ASC, 4=OFC, 5=CC1, 6=CC2`) y `workflow_estado_etapa` (`1=PENDIENTE, 2=APROBADO, 3=RECHAZADO, 5=PEND_DOCS`, sin fila con id 4) para no cementar por escrito un número que resultara estar mal.

**Bug nuevo encontrado y corregido — tercera instancia del mismo patrón que los bugs #1/#2:** los paneles "Pendientes"/"Aprobadas"/"Rechazadas" en `F_PortalClientes/src/app/solicitudes/cliente/SolicitudesContent.tsx` (vista "Mis Solicitudes" del cliente) contaban `sol_estado_id === 1` (BORRADOR, no Pendiente), `=== 3` (REVISION, no Aprobadas) y `=== 4` (COMPLETADA, casi sin uso, no Rechazadas) — igual que en `indicadores.service.ts` (bug #1) y `estadisticasCliente` (bug #2), pero acá **sí está en un flujo que cualquier cliente ve siempre que entra a su lista de solicitudes**, sin necesitar ningún permiso especial. Corregido a `ESTADO_SOLICITUD.PENDIENTE/APROBADA/RECHAZADA.id` (2/5/6 reales).

**Correcciones adicionales (mismo valor, solo referencia con nombre — no cambian comportamiento):**
- `SolicitudesContent.tsx`: las ~13 comparaciones restantes de `sol_estado_id`/`sol_etapa_actual_id`/`sol_resultado_etapa_id` contra literales — se verificaron todas correctas contra los catálogos reales (no había más bugs ahí) y se reemplazaron por `ESTADO_SOLICITUD`/`WORKFLOW_ETAPA`/`WORKFLOW_RESULTADO`.
- Nuevos `F_PortalClientes/src/constants/workflow-etapas.ts` (`WORKFLOW_ETAPA`) y `workflow-resultados.ts` (`WORKFLOW_RESULTADO`), mismo patrón que `estado-solicitud.ts`, valores verificados contra la BD.
- `wetId={4}` (repetido suelto en 3 páginas de gestión, hallazgo original de la sección 4) → `WORKFLOW_ETAPA.OFC.id`. El array `etapasPrevias` de `gestion-comite-credito-2` también pasó a usar `WORKFLOW_ETAPA.OFC/CC1.codigo`/`.id` en vez de literales.
- **Corrección al hallazgo original de los mapas de color** (sección 4 más abajo decía "valores hex distintos" entre los 3 archivos — al revisarlos de cerca para esta migración, resultaron ser **idénticos byte a byte** en los 3, no distintos; la observación original estaba mal). Se extrajeron a `constants/estado-tokens.ts::ESTADO_TOKENS`, con las claves referenciando `ESTADO_SOLICITUD.X.id` en vez de números sueltos, e importado desde las 3 páginas de gestión en vez de mantenerse triplicado.

`npx tsc --noEmit` limpio en el frontend después de cada tanda de cambios. No se hizo verificación visual en navegador (mismo motivo que arriba — rutas protegidas); si se quiere confirmar, revisar "Mis Solicitudes" como cliente de prueba y las 3 pantallas de gestión (CC1/CC2/OFC).

**Además, en el backend**: se corrigió el hallazgo de la sección 3 sobre `solicitudes-workflow.service.ts:249-252` (tres IDs de catálogos distintos, todos con valor `3`, distinguibles solo por comentario) — ahora resuelve `REVISION`/`PENDIENTE` vía `SolicitudEstadosService` y `ASC`/`RECHAZADO`/el `PENDIENTE` de resultado vía `WorkflowService.obtenerEtapaPorCodigo`/`obtenerResultadoPorCodigo`, en vez de comparar contra `3` sueltos. `npx tsc --noEmit` limpio.

**Nota sobre la verificación en vivo de esta ronda**: mientras se preparaba el reinicio del backend para confirmar este último fix, apareció un error de TypeScript real en `common/storage/providers/cloudinary-storage.service.ts` que **no tiene relación con este trabajo** — resultó ser de otro trabajo en progreso corriendo en paralelo en el mismo repo (un módulo `cliente-archivo/` nuevo, integración Cloudinary, cambios de ampliación de cupo, migraciones nuevas — todo sin commitear, no tocado en esta sesión). Se pausó la verificación hasta que ese trabajo ajeno volvió a compilar limpio, para no interferir. Confirmado después, en vivo: `GET /solicitudes/cliente/13606/estadisticas`, `GET /parametrizacion/solicitud-estados` y `GET /indicadores/cumplimiento` siguen devolviendo los valores correctos.

## Cuál era el más grave y por qué (los tres puntos quedaron corregidos, el tercero parcialmente)

**El bug #1 (indicadores) era el más grave de los dos** cuando se detectó, porque no dependía de que alguien disparara una transición específica: se recalculaba cada vez que se abría la página, ya estaba en producción mostrando números incorrectos, y afectaba una métrica de negocio (tasa de aprobación/rechazo) que probablemente se usa para reportar o tomar decisiones. El bug #2 era real pero su exposición práctica era baja porque ningún flujo de la UI lo disparaba — su gravedad era "riesgo latente", no "dato incorrecto ya circulando". Ambos quedaron corregidos el 2026-08-02, junto con las tres soluciones de fondo: #1 (retirar la rama vestigial) y #2 (centralizar `solicitud_estados`) completas, #3 (espejo en frontend) aplicada en su parte de bajo riesgo — la migración completa a fetch en vivo queda como decisión futura, deliberadamente no tomada hoy por su relación riesgo/beneficio.

## 3. Backend — otros hallazgos (`B_PortalClientes/src`)

- **`database/typeorm.config.ts:8-12`** — credenciales `sa`/`123456` en texto plano, commiteadas en git. Es código muerto (`app.module.ts` usa `TypeOrmModule.forRoot` con `process.env.DB_*`, no este archivo), pero queda en el historial de git y alguien podría reimportarlo por error.
- **`main.ts:17-29`** — middleware de log siempre activo (sin flag de entorno) que imprime `req.body` completo de cada request, incluyendo contraseñas en texto plano de `/auth/login`, `/auth/register` y `/change-password`.
- **`auth/jwt-auth.guard.ts:17-27`** — whitelist de roles (`ROLES_PERMITIDOS`) hardcodeada, duplicada a mano con `F_PortalClientes/src/proxy.ts` (el propio comentario del archivo lo admite). Un rol nuevo en `pc_roles` sin actualizar ambos arrays produce `401 Rol no válido` sin explicar la causa real.
- **`solicitudes/solicitudes-workflow.service.ts:219`** — `cambiarEstado(..., usuarioId: number = 1)`. Si el caller omite `usuarioId` o el guard no resuelve `req.user.usr_id`, la transición queda atribuida en el historial de auditoría al usuario `1` en vez de fallar explícitamente.
- **`mail/mail.service.ts:18`** — `BREVO_API_URL` hardcodeada (bajo riesgo, no es secreto, pero el resto de la config de Brevo sí sale de `.env`).
- **`solicitudes/solicitudes.service.ts:143-156`** — nombres de área (`'OFICIAL CUMPLIMIENTO'`, `'COMITÉ CRÉDITO 1'`, etc.) usados como string literal para resolver SLA vía `param_dias_respuesta_solicitudes`; un typo/tilde que no calce con la BD cae en silencio al fallback de 3 días (mismo patrón de riesgo ya documentado para `business-days.util.ts`).
- Rol `'CLIENTE'` como string literal repetido en ~13 archivos (`permissions.service.ts`, `pqrs.service.ts`, `solicitudes-documentos.service.ts`, `auth.service.ts`, etc.), sin enum/constante central — existe `common/constants/tablas.constants.ts` para nombres de tabla/columna pero nada equivalente para códigos de rol.

## 4. Frontend — hallazgos (`F_PortalClientes/src`)

- **`services/auth.service.ts:10`** — el cambio de contraseña hace `fetch("http://localhost:3001/usuarios/change-password")` directo, en vez de usar el cliente `api` central (`services/core/api.ts`, que sí resuelve `NEXT_PUBLIC_API_URL`). Roto en cualquier ambiente que no sea el localhost del desarrollador.
- **`hooks/useAuth.tsx:33`** compara `rol_id === 2` sin nombre; **`app/dashboard/page.tsx:17-22`** define su propio `ROLES` local (no exportado) con los mismos valores — dos fuentes independientes para el mismo dato.
- `pageSize`/`itemsPerPage` hardcodeado sin coordinar en ~9 archivos: `10` en la mayoría (`parametrizacion/clientes`, `pedidos/mis-pedidos`, `solicitudes/corregir-formulario-asc`, las cuatro páginas `gestion-*`), `5` en `solicitudes/cliente/SolicitudesContent.tsx:67` — sin un `DEFAULT_PAGE_SIZE` compartido.
- **`components/pqrs/PQRSAdjuntos.tsx:23`** — `MAX_TAMANO_BYTES = 10 * 1024 * 1024` validado solo en cliente, no sincronizado con el límite real del backend/multer.

**[CORREGIDO 2026-08-02] Los siguientes 4 hallazgos de esta sección ya fueron resueltos** (ver "Segunda vuelta" en la sección del bug #2 más arriba, y el detalle de la solución de fondo #3): el bug real en `SolicitudesContent.tsx:504-701` (~15 comparaciones, incluida una tercera instancia del bug de estados #1/#2 en los paneles "Pendientes/Aprobadas/Rechazadas"), el `wetId=4` repetido en 3 páginas de gestión, los dos catálogos de estado compitiendo, y los mapas de color hex duplicados (que resultaron ser idénticos entre sí, no distintos como se pensó al principio).

## Pendiente / no incluido en este trabajo

- Los hallazgos #1 y #2 fueron verificados en vivo (base de datos compartida) y trazando los call sites reales en el código, y ambos ya están corregidos. El resto de los hallazgos (secciones 3 y 4) son de lectura de código, sin aplicar fix — recomendable confirmar cada uno antes de tocarlo, sobre todo los de severidad media/baja.
- Las tres soluciones de fondo listadas en la sección del bug #2 (retirar la rama vestigial de `cambiarEstado`, centralizar `solicitud_estados` en un servicio cacheado, exponer el catálogo al frontend) quedaron sin aplicar — son refactors de alcance mayor, a decidir en otra sesión.
- Relacionado: la deuda ya documentada de `alert()`/`confirm()` nativos (ver [`Funcionalidades/Versionado-de-Formularios.md`](Funcionalidades/Versionado-de-Formularios.md#deuda-técnica-de-ui-modales-viejos-alertconfirm-nativos-del-navegador)) y el fallback de `BACKEND_URL` en `next.config.ts` (ver `CLAUDE.md`) son hardcodeos ya conocidos, no repetidos acá.
