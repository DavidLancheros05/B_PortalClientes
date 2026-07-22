# SLA por etapa / Fechas estimadas de gestión — Análisis

> Funcionalidad: plazo máximo esperado de gestión por etapa del workflow (Ejecutivo de Negocios, Auxiliar Servicio Cliente, Oficial de Cumplimiento, Comité de Crédito 1, Comité de Crédito 2), parametrizado en `param_dias_respuesta_solicitudes` y usado para calcular fechas estimadas/reales por solicitud.
>
> Auditoría hecha sobre el código real (`B_PortalClientes/src`, `F_PortalClientes/src`), contrastada con la base de datos en vivo y pruebas directas contra el backend (`curl` + JWT). Generado 2026-07-18.

## Ventajas (confirmadas en código)

1. **Cálculo real de días hábiles**, no días calendario a secas — `common/utils/business-days.util.ts` (`addBusinessDays`) salta fines de semana y está preparado para excluir festivos.
2. **El combo de "área" en el admin de SLA se sincroniza dinámicamente** con `workflow_etapas` (`dias-respuesta.service.ts`) en vez de tener strings hardcodeados en el frontend que se puedan desincronizar.
3. **Registro correcto y consistente de "fecha real" por etapa** en cada transición del workflow (`guardarConceptoGenerico`, `guardarGestionEjecutivo`, `aprobarRechazarSolicitud`).
4. **Badges de "Vencido hace N días / Vence hoy / N días"** bien implementados y coloreados por severidad en las 5 bandejas internas de gestión (Ejecutivo, Auxiliar, Oficial de Cumplimiento, Comité 1, Comité 2).
5. **Dashboard de indicadores** (`/solicitudes/indicadores`) con KPIs, gráfico real vs. estimado, tendencia mensual y drill-down por solicitud — buen nivel de detalle y UX.
6. **Lógica SQL de "a tiempo vs. vencida"** en `indicadores.service.ts` es correcta y consistente entre las distintas consultas de cumplimiento.

## Errores / Bugs (confirmados)

1. **Crear un nuevo parámetro de SLA está roto para todas las áreas reales.** El DTO exige `pdr_area: 'COMERCIAL' | 'FINANCIERA'`, pero el dropdown del admin ofrece los nombres reales de `workflow_etapas` (`Ejecutivo Negocios`, `Auxiliar Servicio Cliente`, etc.). Probado en vivo: `POST /parametrizacion/dias-respuesta` con cualquier área real → `400 Bad Request`. Los registros que sí existen hoy tuvieron que insertarse por otra vía (no por el formulario de creación).
2. **El controller de administración de SLA no tiene guard de autenticación.** Probado en vivo: `PATCH /parametrizacion/dias-respuesta/:id/estado` sin token → `200 OK`. Cualquiera sin sesión puede crear/editar/activar/inactivar los plazos de SLA.
3. ~~**Las 5 fechas estimadas de una solicitud se calculan una sola vez, en paralelo, desde la fecha de creación**~~ **[Corregido 2026-07-21]** — se detectó en producción porque dos solicitudes de prueba mostraban la misma "fecha estimada desde inicio" en Auxiliar Servicio Cliente y Oficial de Cumplimiento (ambas con el fallback de 3 días hábiles, ambas sumadas desde la misma fecha de creación en vez de encadenarse). Fix en `solicitudes.service.ts`: cada `addBusinessDays` ahora parte de la fecha estimada de la etapa anterior (Ejecutivo → Auxiliar → Oficial → CC1 → CC2) en vez de partir todas de `now`. Sigue sin haber recálculo al transicionar realmente de etapa (`cambiarEtapa()` no las toca) — por diseño, "desde inicio" es la proyección fija asumiendo cero demoras; el valor que sí refleja la demora real acumulada es "desde etapa anterior" (`swh_fecha_estimada`, calculado en `historial-workflow.service.ts` en el momento real de cada transición — ese cálculo ya era correcto, no tenía este bug).
4. ~~**La tabla `Festivos` está vacía en producción.**~~ **[Corregido 2026-07-21]** — se cargaron los 18 festivos oficiales de Colombia para 2026 (`migrations/20260721_llenar_festivos_2026_colombia.sql`), calculados con Pascua 2026-04-05 (algoritmo de Gauss) y Ley Emiliani para los movibles a lunes. De paso se agregó `param_dias_no_habiles_semana` (nueva tabla, `migrations/20260721_crear_param_dias_no_habiles_semana.sql`) para que cuáles días de la semana cuentan como no hábiles también sea parametrizable (antes hardcodeado a sábado/domingo en `isBusinessDay`) — sin pantalla de administración propia, igual criterio que `Festivos`.
   - **Bug adicional encontrado y corregido de paso**: `business-days.util.ts` hacía toda la aritmética con getters/setters de **hora local** del proceso (`getDate`, `setDate`, `getDay`). Las columnas `sol_fecha_estimada_*` son `date` en SQL Server (sin hora/zona) y el driver `mssql` las serializa/deserializa como medianoche UTC — si el proceso Node corre en una zona horaria distinta de UTC, leer una de estas columnas y hacer aritmética con getters locales puede desfasar el resultado un día completo. Detectado al recalcular retroactivamente las fechas de solicitudes existentes desde una máquina en `America/Bogota` (UTC-5). Fix: toda la lógica de `business-days.util.ts` ahora usa `getUTC*`/`setUTC*`. No se detectó evidencia de que esto afectara producción (que corre presumiblemente en UTC), pero es un riesgo latente para cualquier cálculo futuro sobre estas columnas hecho desde un entorno no-UTC.
5. **El bloque "Área Comercial" del timeline de una solicitud (`GET /indicadores/solicitud`) es código muerto** — el SQL nunca selecciona `est_comercial`/`real_comercial`, así que ese tramo del timeline siempre sale vacío.
6. **3 pantallas de gestión (Comité 1, Comité 2, Oficial de Cumplimiento) piden `GET /solicitudes/parametros/dias-respuesta` y nunca usan la respuesta** — llamada HTTP muerta en cada carga de página.
7. **El stepper de "Registrar Concepto" del Ejecutivo de Negocios siempre usa valores hardcodeados** (`DEFAULT_DIAS`) porque sus claves (`Concepto`, `Comercial`, `Financiera`) no existen en los datos reales — resto de un modelo de etapas anterior que nunca se actualizó.
8. **Los indicadores de cumplimiento solo cuentan solicitudes ya finalizadas por etapa** (`WHERE fecha_real IS NOT NULL`) — no hay detección de "vencida en curso" para solicitudes actualmente atascadas.
9. **Entidad TypeORM duplicada y no usada** (`ParamDiasRespuestaEntity`) mapeando la misma tabla que la entidad `DiaRespuesta` sí usada — riesgo de que a futuro se editen columnas en un solo lugar y queden desincronizadas.
10. **8 columnas de fecha** (`*_comite_credito_1_ejecutivo`, `*_comite_credito_2_auxiliar`, etc.) se leen en varias consultas pero nunca se escriben en ningún flujo — siempre `NULL`, resto de un diseño anterior.
11. **`fecha_estimada_respuesta_comercial` no tiene ningún input real en el frontend** para fijarla manualmente; se reenvía tal cual llegó, normalmente `null`.
12. **Inconsistencia de unidades**: el plazo se fija en días hábiles, pero el contador "días faltantes" del frontend cuenta días calendario simples.
13. **No hay validación de un único parámetro activo por área** — se pueden crear duplicados; el sistema resuelve la ambigüedad silenciosamente tomando el más reciente (`TOP 1 ORDER BY pdr_id DESC`).

## Ausencias notables (no existen, confirmado)

1. **No hay ningún cron/job ni endpoint de "alerta de SLA por vencer/vencido"** a nivel de etapa. Lo único que existe es una alerta semanal de *vigencia de documentos*, que es un concepto distinto.
2. **No hay funcionalidad de reasignación** de gestor/etapa en el código, y por lo tanto tampoco recálculo de SLA al reasignar.
3. **No hay escalamiento automático** a un supervisor cuando una etapa se vence.
4. **El cliente nunca ve el SLA.** Ninguna pantalla del portal del cliente muestra "tu solicitud será respondida en X días hábiles" — todo el tooling de SLA es interno (Ejecutivo, Auxiliar, Oficial de Cumplimiento, Comités).
5. **No hay manejo real de festivos colombianos** (tabla vacía), aunque el código esté preparado para soportarlo.

## Mejoras / Sugerencias

1. **Corregir el DTO de creación de SLA** (`create-dia-respuesta.dto.ts`) para aceptar las áreas reales de `workflow_etapas` en vez de `COMERCIAL`/`FINANCIERA`, o generar el `@IsIn` dinámicamente desde la misma fuente que alimenta `/areas`.
2. **Agregar `@UseGuards(JwtAuthGuard)` (y rol `ADMIN`) al controller de `dias-respuesta`** — hoy queda expuesto sin autenticación, a diferencia de módulos hermanos.
3. **Recalcular la fecha estimada de la etapa siguiente en el momento real de la transición** (dentro de `cambiarEtapa()`), en vez de fijar las 5 fechas en paralelo desde el día de creación. Esto es el cambio de mayor impacto: corrige de raíz el sesgo hacia "vencido" en etapas tardías, tanto en los badges como en los indicadores.
4. **Cargar la tabla `Festivos`** con el calendario colombiano (y un proceso para mantenerla actualizada año a año) para que el cálculo de días hábiles sea real y no solo excluya fines de semana.
5. **Eliminar o corregir el bloque "Área Comercial"** en `getSolicitudTimeline` — o se completa el SQL para traer `est_comercial`/`real_comercial`, o se retira ese tramo muerto del timeline.
6. **Quitar las 3 llamadas HTTP muertas** a `GET /solicitudes/parametros/dias-respuesta` en las pantallas de Comité 1, Comité 2 y Oficial de Cumplimiento, o completar su uso si el stepper era la intención original.
7. **Actualizar (o retirar) el stepper hardcodeado** de "Registrar Concepto" del Ejecutivo de Negocios para que refleje las 6 etapas reales del workflow y consuma el parámetro configurado, no `DEFAULT_DIAS`.
8. **Agregar un indicador de "vencidas en curso"** (solicitudes con `fecha_estimada &lt; hoy` y `fecha_real IS NULL` en su etapa actual) a los indicadores de cumplimiento, para que el dashboard sea operativo y no solo retrospectivo.
9. **Eliminar la entidad `ParamDiasRespuestaEntity` no usada** y las 8 columnas de fecha huérfanas (o documentarlas explícitamente como legado si no se pueden borrar de la BD todavía).
10. **Unificar el cálculo de "días restantes"** del frontend a días hábiles (misma unidad que el backend usa para fijar el plazo), y extraer `calcularDiasRestantes`/`getDiasRestantesDisplay` a un solo util compartido en vez de la copia duplicada en 5-6 archivos.
11. **Agregar una notificación/alerta de SLA por vencer** (correo o indicador push) para el gestor responsable de la etapa, y opcionalmente un escalamiento a supervisor si se vence sin gestión.
12. **Mostrarle al cliente una fecha estimada de respuesta** en su propio panel (`Mis Solicitudes` / detalle), aprovechando el endpoint `GET /solicitudes/parametros/dias-respuesta` que ya existe pero hoy solo consumen pantallas internas.
13. **Agregar validación de unicidad** (un solo parámetro activo por área) en el service, en vez de resolver la ambigüedad silenciosamente por `pdr_id` más reciente.
