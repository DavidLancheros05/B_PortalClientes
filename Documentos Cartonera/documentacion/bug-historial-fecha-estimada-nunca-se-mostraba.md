# Bug: el panel "Historial de Solicitud" nunca mostraba ninguna fecha estimada

> Encontrado el 2026-07-21, como continuación de
> [[bug-historial-muestra-etapas-resueltas-como-pendientes]] — después de
> arreglar el ícono ✓/…, el usuario notó que ninguna etapa mostraba su fecha
> estimada, ni siquiera tras exponer el campo en el backend.

## Causa raíz (dos partes)

**1) El backend solo devolvía un campo, y encima casi siempre en NULL.**
`historial-workflow.service.ts::obtenerHistorial` seleccionaba
`swh.swh_fecha_estimada as fechaEstimada` — un valor calculado en
`registrarTransicionConSLA` en el momento real en que la solicitud entra a
la etapa (creación/transición + días SLA de `param_dias_respuesta_solicitudes`
para el nombre de esa etapa). Si no hay una fila de configuración para esa
área exacta, el valor queda NULL. Aparte de eso, existe una fuente
totalmente distinta y ya poblada de forma confiable: las 5 columnas fijas
`sol_fecha_estimada_ejecutivo` / `_auxiliar_servicio_cliente` /
`_oficial_cumplimiento` / `_comite_credito_1` / `_comite_credito_2` en
`solicitudes`, calculadas UNA sola vez al crear la solicitud
(`solicitudes.service.ts`, sección "Obtener días configurados para cada
etapa del workflow") con fallback a 1/3/3/3/3 días si tampoco hay
configuración — por eso ese valor casi siempre existe.

Son dos conceptos distintos y ambos útiles:
- **"Desde inicio"** (`sol_fecha_estimada_*`): cuándo se esperaba esa etapa
  asumiendo que la solicitud avanzara sin demoras desde su creación. Fijo,
  no se mueve.
- **"Desde etapa anterior"** (`swh_fecha_estimada`): cuándo se espera esa
  etapa contando la demora real acumulada — calculado justo cuando la
  solicitud entró a la etapa. Puede ser NULL si falta configuración.

El fix expone ambos como campos separados
(`fechaEstimadaInicio` / `fechaEstimadaEtapaAnterior`) en vez de intentar
fusionarlos en uno solo con `COALESCE` (que fue el primer intento, luego
descartado porque el usuario pidió ver los dos valores).

**2) Aunque el backend ya devolviera el dato, CADA pantalla arma a mano el
objeto que le pasa a `HistorialSolicitud`, y ninguna (salvo
`gestion-ejecutivo-negocios/[id]/registrar`, arreglada en
[[bug-historial-falso-registrar-concepto-ejecutivo]]) incluía el campo de
fecha estimada en ese mapeo.** El dato llegaba del backend pero se
descartaba antes de llegar al componente. Afectaba:
- `gestion-auxiliar-servicio-al-cliente/[id]/gestionar/page.tsx` (mapeo
  inline)
- `hooks/useHistorialWorkflow.ts` (mapeo compartido — usado por
  `[id]/detalle`, `gestion-comite-credito-1/[id]/gestionar`,
  `gestion-comite-credito-2/[id]/gestionar`,
  `gestion-oficial-de-cumplimiento/[id]/gestionar`)
- `[id]/historial/page.tsx` (mapeo inline)

## Fix aplicado

- `historial-workflow.service.ts::obtenerHistorial`: la fila SQL ahora
  selecciona `fechaEstimadaInicio` (CASE por `wet_codigo` sobre las 5
  columnas de `solicitudes`) y `fechaEstimadaEtapaAnterior`
  (`swh_fecha_estimada` tal cual) como dos alias separados.
- `HistorialSolicitud.tsx`: interfaz y render actualizados para mostrar dos
  líneas ("Fecha estimada desde inicio" / "Fecha estimada desde etapa
  anterior") en vez de una sola "Fecha estimada".
- Los 3 mapeos inline + el hook compartido ahora pasan ambos campos.

## Verificación

- Typecheck limpio en backend y frontend (`npx tsc --noEmit` en ambos
  proyectos).
- Pendiente verificar en vivo con `sol_id=2187` que "Fecha estimada desde
  inicio" aparece en Ejecutivo Negocios y Auxiliar Servicio Cliente (las
  únicas etapas con columna dedicada); "Fecha estimada desde etapa
  anterior" puede seguir en blanco si nunca se configuró
  `param_dias_respuesta_solicitudes` para esos nombres de etapa exactos —
  eso ya no es un bug de mapeo, es ausencia de configuración real.

## Nota para revisar

Si "Fecha estimada desde etapa anterior" sigue sin aparecer nunca para
ninguna solicitud, el siguiente paso sería confirmar si
`param_dias_respuesta_solicitudes` tiene filas cuyo `pdr_area` coincida
exactamente con `workflow_etapas.wet_nombre` (ej. "Ejecutivo de Negocios",
"Auxiliar Servicio Cliente") — la pantalla de admin en
`parametrizacion/dias-respuesta` sí ofrece esos nombres vía
`DiasRespuestaService.obtenerAreas()` (lee `DISTINCT wet_nombre` de
`workflow_etapas`), así que es plausible que simplemente nadie los haya
configurado todavía, no que el código esté mal.
