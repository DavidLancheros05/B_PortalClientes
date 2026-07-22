# Por qué el plan de SLA no vio "ampliación de cupo" — análisis

> Post-mortem del proceso de planeación del cambio "fecha estimada vigente por etapa" (ver [Fechas-Estimadas-SLA.md](Fechas-Estimadas-SLA.md)). Generado 2026-07-18 a pedido del usuario, tras encontrar durante la implementación un octavo punto de escritura al historial que el plan original no cubría.

## Qué pasó, en orden

1. La primera auditoría (`Fechas-Estimadas-SLA.md`) nació de una pregunta puntual sobre las **bandejas de gestión** del flujo principal de vinculación (Ejecutivo → Auxiliar → Oficial de Cumplimiento → Comité 1 → Comité 2). Nunca se planteó como "auditar todo lo que escribe en `solicitud_workflow_historial`" — se planteó como "¿por qué las fechas estimadas de esas bandejas están mal?".
2. Para armar el plan, se lanzó un agente de exploración con instrucciones que ya asumían el terreno: le pedí explícitamente revisar `solicitudes-workflow.service.ts` y `workflow.service.ts`, porque eran los archivos que la auditoría anterior ya había identificado como dueños del flujo. El agente encontró ahí, correctamente, 7 sitios de transición — pero nunca hizo un grep de todo `src/` en busca de `INSERT INTO solicitud_workflow_historial`; buscó *dentro de* los archivos que yo ya le había señalado.
3. El primer `grep` realmente global (`path: src`, sin restringir archivo) se hizo recién en el paso 3 de la implementación, cuando ya estaba migrando los 7 sitios y quise confirmar que no quedara ninguno suelto. Ahí apareció `ampliacion-cupo.service.ts` por primera vez en toda la conversación.
4. `ampliacion-cupo/` es un módulo aparte (sección 11 de `Todas.md`, "Ampliación de Cupo"), no la sección 9 ("Flujo de Aprobación / Workflow"). Es una funcionalidad distinta que **reutiliza las mismas tablas** (`solicitudes`, `solicitud_workflow_historial`, `workflow_etapas`) porque una ampliación de cupo es, en la base de datos, una fila más de `solicitudes` que entra al mismo workflow — pero tiene su propio flujo de creación (`AmpliacionCupoService.create()`), separado de `SolicitudesService.crearSolicitud()`.

## Causa raíz

El plan se construyó **de adentro hacia afuera**: partió de los archivos que el contexto ya conocido señalaba, en vez de partir de la tabla/columna afectada y preguntar "¿quién más escribe esto en todo el repo?". Eso es exactamente el tipo de sesgo que un grep global barato habría evitado, y que si se hace, hay que hacerlo **antes** de fijar el alcance del plan y pedir aprobación — no después, mientras ya se está implementando.

Dicho de otra forma: la Fase 1 de exploración (plan mode) delegó la búsqueda a un agente con un prompt que ya traía los nombres de archivo "correctos" incluidos, en vez de pedirle primero un barrido neutral tipo *"¿en qué archivos de todo `src/` aparece `solicitud_workflow_historial`?"*. Ese barrido neutral sí se hizo — pero en el paso equivocado del proceso (durante la implementación, no durante la planeación).

## Verificación completa a partir de este hallazgo

Para no repetir el mismo sesgo al escribir este documento, se hizo ahora un grep global de tres patrones (`solicitud_workflow_historial`, `sol_etapa_actual_id\s*=`, `sol_fecha_estimada_`) sobre todo `src/`. Resultado: 11 archivos.

| Archivo | Relación con el cambio | Estado |
|---|---|---|
| `solicitudes.service.ts` | Creación de solicitud (sitio 8, ya corregido) | ✅ Cubierto |
| `solicitudes-workflow.service.ts` | 6 de los 7 sitios de transición | ✅ Cubierto |
| `workflow.service.ts` | `cambiarEtapa()`, 1 sitio de transición | ✅ Cubierto |
| `historial-workflow.service.ts` | Dueño del nuevo helper y de los SELECT | ✅ Es el propio cambio |
| `solicitud-workflow-historial.entity.ts` | Entidad TypeORM (no se usa para leer/escribir, solo tipado) | ✅ Actualizada |
| `solicitudes-listados.service.ts` | Bandejas de gestión (lectura) | ✅ Cubierto |
| `indicadores.service.ts` | Cumplimiento/timeline (lectura) | ✅ Cubierto |
| `solicitud.entity.ts` | Columnas `sol_fecha_estimada_*` como entidad TypeORM | Solo tipado, no ejecuta lógica — nada que cambiar |
| `solicitud-listado-gestion.response.dto.ts` | DTO de documentación (no usado como contrato real, ver `Fechas-Estimadas-SLA.md`) | Sin acción — bug ya documentado aparte |
| `solicitudes-documentos.service.ts` | Coincidencia falsa: un comentario que *menciona* la tabla al explicar un `ON DELETE CASCADE`, no una escritura real | Sin acción |
| **`ampliacion-cupo.service.ts`** | **Crea una solicitud con su propio `INSERT INTO solicitud_workflow_historial` (líneas 194-199), sin pasar por el helper nuevo** | ❌ Gap real, sin corregir |

## Alcance exacto del gap en `ampliacion-cupo.service.ts`

Se revisó el archivo completo (341 líneas). Tiene 6 métodos: `create()`, `update()`, `remove()`, `findAll()`, `findOne()`, `findByCliente()`.

- **`create()`** (líneas 35-215): inserta la solicitud de ampliación con `sol_etapa_actual_id`/`sol_resultado_etapa_id` ya resueltos (líneas 140-141, 152, 173-174) y, en las líneas 194-199, hace el `INSERT INTO solicitud_workflow_historial` crudo — el mismo patrón que tenía `solicitudes.service.ts:421` antes de corregirlo hoy. Este es el único punto real del gap.
- **`update()`** (líneas 296-325): solo modifica `sol_cupo_solicitado` y `sol_justificacion_ampliacion`. No toca etapa/resultado, así que no escribe historial — no aplica.
- **`remove()`** (líneas 327-340): solo limpia esas mismas dos columnas para "desmarcar" la ampliación. Tampoco toca etapa/resultado — no aplica.
- Una vez creada, la solicitud de ampliación de cupo entra al **mismo** flujo de aprobación que cualquier otra solicitud (Ejecutivo → Auxiliar → …), así que **todas sus transiciones posteriores ya pasan por los 8 sitios que sí se corrigieron hoy** (viven en `solicitudes-workflow.service.ts`/`workflow.service.ts`, compartidos por todo tipo de solicitud). El gap está contenido exclusivamente a la primera fila de historial de una ampliación de cupo.

## Corrección pendiente (no aplicada todavía)

Mismo cambio que ya se hizo en `solicitudes.service.ts:421` — en `ampliacion-cupo.service.ts:194-199`, reemplazar:

```ts
await queryRunner.query(
  `INSERT INTO solicitud_workflow_historial
   (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_fecha)
   VALUES (@0, @1, @2, @3, @4)`,
  [solicitudId, etapaId, resultadoId, usuarioId, now],
);
```

por:

```ts
await this.historialWorkflowService.registrarTransicionConSLA(queryRunner, {
  solicitudId,
  etapaId,
  resultadoId,
  usuarioId,
});
```

Requiere inyectar `HistorialWorkflowService` en `AmpliacionCupoService` (agregar `WorkflowModule` a los imports de `AmpliacionCupoModule` si no está ya). No se aplicó porque no formaba parte del plan aprobado por el usuario — queda documentado aquí para decidir si se hace como seguimiento.

## Lección para próximos planes de este tipo

Cuando el cambio toca una tabla o columna compartida entre módulos (como `solicitud_workflow_historial`, que cualquier tipo de solicitud puede escribir), la Fase 1 de exploración debe incluir explícitamente un grep **sin restricción de archivo** sobre el nombre de la tabla/columna en todo `src/`, *antes* de redactar el plan — no asumir que los archivos ya conocidos por el contexto previo son los únicos relevantes. Ese barrido debe ser parte de lo que se le pide al agente de exploración, no algo que se descubre por accidente ya en implementación.
