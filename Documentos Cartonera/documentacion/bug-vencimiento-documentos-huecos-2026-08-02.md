# Vencimiento de documentos: 4 huecos encontrados y corregidos (2026-08-02)

## Contexto

Revisión pedida por el usuario sobre "qué documentación hay del vencimiento
de documentos", que terminó en una auditoría del código real (no solo de
`documentacion/`) de las tres piezas que tocan `sa_fecha_vencimiento`:
`solicitudes-documentos.service.ts`, `ampliacion-cupo.service.ts` y
`notificaciones.service.ts::procesarAlertaSemanalDocumentos`. Se encontraron
4 problemas concretos, verificados en código (no solo inferidos de la
documentación existente), y los 4 se corrigieron la misma sesión.

## 1. `NotificacionesController` sin ningún guard de autenticación

**Síntoma**: ningún endpoint de `notificaciones.controller.ts` tenía
`@UseGuards(JwtAuthGuard)` — `POST /notificaciones/alertas-documentos/procesar`,
`PUT /notificaciones/plantillas/:codigo` y
`POST /notificaciones/usuarios/credenciales/enviar` eran alcanzables sin
token por cualquiera.

**Fix**: `@UseGuards(JwtAuthGuard)` a nivel de clase; `plantillas` (GET/PUT) y
`alertas-documentos/procesar` restringidos además a rol `ADMIN`
(`@UseGuards(RolesGuard) @Roles('ADMIN')`).

**Efecto colateral encontrado al verificar**: esto expuso un ciclo de
dependencias preexistente — `AuthModule` ya importaba `NotificacionesModule`
(para el correo de reset de contraseña) sin `forwardRef`. Al agregar
`AuthModule` a `NotificacionesModule` (necesario para que `JwtAuthGuard`
resuelva `JwtService`), el ciclo `AuthModule <-> NotificacionesModule` rompía
el arranque (`UnknownDependenciesException` primero,
`UndefinedModuleException` después). Se resolvió con `forwardRef()` en
ambos lados (`auth.module.ts` y `notificaciones.module.ts`). Sin este ajuste
el backend no arranca — cualquier cambio futuro que toque estos dos módulos
debe respetar el `forwardRef`.

## 2. `verificarDocumentosVencidos` miraba cualquier solicitud histórica del cliente, no la última

**Archivo**: `ampliacion-cupo.service.ts`.

**Síntoma**: la query original no restringía por `sol_id`, solo por
`sol_cliente_id` con `ORDER BY s.sol_id DESC` sobre el resultado ya
filtrado por "vencido" — es decir, buscaba *cualquier* documento vencido en
*cualquier* solicitud del cliente (incluida una rechazada o cancelada hace
tiempo), no específicamente los de su solicitud más reciente. Un cliente
con una solicitud vieja con un documento vencido quedaba bloqueado
permanentemente aunque su solicitud más reciente tuviera todo vigente.

**Fix**: subquery `TOP 1 sol_id ORDER BY sol_id DESC` para fijar primero
cuál es la última solicitud del cliente, y solo entonces buscar vencidos
ahí. (Este fix quedó luego superado por el punto 4 más abajo — ver
`documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md`.)

## 3. Documentos con regla de vigencia `ANIO` nunca generaban `sa_fecha_vencimiento`

**Archivo**: `solicitudes-respuestas.service.ts`.

**Síntoma**: el cálculo de vencimiento al subir/corregir un documento solo
usaba `tdo_vigencia_dias`. Un tipo de documento con
`tdo_regla_vigencia = 'ANIO'` (ej. RUT, Estados GYP — ver comentario en
`FRONTEND/src/lib/documentos-vigencia.util.ts`) tiene `vigencia_dias = NULL`
por diseño (usa `tdo_anios_atras_permitidos` en su lugar), así que
`sa_fecha_vencimiento` quedaba `NULL` para siempre en esos documentos. El
frontend sabe calcular su vigencia al vuelo
(`calcularEstadoAnioDocumento`), pero el backend no — y todo lo que depende
de la columna (alerta semanal, `verificarDocumentosVencidos`,
`estado_vencimiento` en `getDocumentos()`) los ignoraba por completo.

**Fix**: nuevo helper `calcularFechaVencimiento` en
`solicitudes-respuestas.service.ts` que también calcula vencimiento para
`ANIO`: el documento vence el 31 de diciembre de
`(año de emisión + tdo_anios_atras_permitidos)` — mismo criterio que
`calcularEstadoAnioDocumento` en el frontend (`valido` mientras
`anioActual - anioEmision <= aniosAtrasPermitidos`). Usado en las dos rutas
que escriben `sa_fecha_vencimiento` (subida de archivo y corrección de
fecha de un documento ya subido).

## 4. Nada disparaba `procesarAlertaSemanalDocumentos` automáticamente

**Síntoma**: el endpoint `POST /notificaciones/alertas-documentos/procesar`
existía y la función ya traía su propio guard interno de "solo lunes"
(`forzar=false` por defecto), pero no había ningún cron ni scheduler en el
proyecto (`@nestjs/schedule` ni siquiera estaba instalado) — la "alerta
semanal" documentada en `modulos-generales-del-proyecto.md` nunca salía
sola.

**Fix**: se agregó la dependencia `@nestjs/schedule`, `ScheduleModule.forRoot()`
en `app.module.ts`, y un método `@Cron('0 8 * * 1', { timeZone: 'America/Bogota' })`
(`ejecutarAlertaSemanalDocumentosProgramada`) en `notificaciones.service.ts`
que llama a `procesarAlertaSemanalDocumentos(true)` cada lunes 8am hora
Bogotá. Se eligió un cron **interno** al backend (no uno externo pegándole
al endpoint) porque es autocontenido y no requiere que el usuario configure
nada fuera del código; el único riesgo no verificable desde el código es si
el plan de Render en el que corre el backend duerme por inactividad — si
eso llegara a pasar, el endpoint ya queda protegido y listo para que un
cron externo lo dispare en su lugar sin deshacer nada de esto.

## Verificación

Los 4 fixes se verificaron con `npx tsc --noEmit` y arranque real del
backend (`npm run start:dev`, confirmando `Nest application successfully
started` sin errores de DI). No se probó en vivo el envío real de la
alerta semanal (requeriría esperar al lunes o forzarla con
`?forzar=true` contra un `ADMIN` real) ni el cálculo de vencimiento ANIO
contra un documento real subido después del fix.
