# Flujo de etapas de una solicitud

Cada solicitud se identifica en qué punto del flujo está por la combinación de
tres columnas de la tabla `solicitudes`:

- **`sol_estado_id`** → tabla `solicitud_estados`
- **`sol_etapa_actual_id`** → tabla `workflow_etapas` (quién la tiene en su bandeja)
- **`sol_resultado_etapa_id`** → tabla `workflow_estado_etapa` (qué pasó en esa etapa)

## Catálogos

| `sol_estado_id` | Código | Nombre |
|---|---|---|
| 1 | BORRADOR | Borrador |
| 2 | PENDIENTE | Pendiente |
| 3 | REVISION | Revisión |
| 4 | COMPLETADA | Completada (genérico, poco usado) |
| 5 | APROBADA | Aprobada |
| 6 | RECHAZADA | Rechazada |

| `sol_etapa_actual_id` | Código | Rol dueño de la bandeja |
|---|---|---|
| 1 | CLI | Cliente |
| 2 | EJN | Ejecutivo de Negocios |
| 3 | ASC | Auxiliar Servicio Cliente |
| 4 | OFC | Oficial de Cumplimiento |
| 5 | CC1 | Comité de Crédito 1 |
| 6 | CC2 | Comité de Crédito 2 |

| `sol_resultado_etapa_id` | Código | Nombre |
|---|---|---|
| 1 | PENDIENTE | Pendiente |
| 2 | APROBADO | Aprobado |
| 3 | RECHAZADO | Rechazado |
| 5 | PEND_DOCS | Pendiente de documentos generados (plantillas) |

## Tabla de combinaciones → acción esperada

| estado | etapa | resultado | ¿Quién actúa? | Acción |
|---|---|---|---|---|
| 1 BORRADOR | 1 CLI | 1 PENDIENTE | Cliente | Está llenando el formulario, nadie más lo ve. Debe completarlo y enviarlo. |
| 2 PENDIENTE | 1 CLI | 5 PEND_DOCS | Cliente | Ya envió, pero le faltan documentos que solo se pueden generar después de guardar (`Tipos_documentos.tdo_tipo_plantilla`: `TEXTO` con placeholders como `{{numero_solicitud}}` — ej. Manifestación suscrita —, o `PDF_SOLICITUD` que descarga el PDF completo de la solicitud ya guardada — ej. F-P3-06). Debe ir a **Mis Documentos**, descargar cada plantilla pendiente (recuadro azul con tarjetas por documento), firmarla, subirla con "Subir firmado", y una vez subidas todas pulsar **"Enviar e informar a Cartonera"** (el botón queda deshabilitado/gris hasta que todas las tarjetas estén en verde) — recién ahí pasa a Ejecutivo de Negocios. |
| 2 PENDIENTE | 2 EJN | 1 PENDIENTE | Ejecutivo de Negocios | Debe revisar la solicitud y registrar el concepto comercial (consumo mensual proyectado + observaciones). `PUT :id/concepto-ejecutivo`. |
| 3 REVISION | 3 ASC | 1 PENDIENTE | Auxiliar Servicio Cliente | Debe revisar los documentos y aprobar o rechazar (checklist de documentos faltantes/fecha incorrecta). `PUT :id/aprobacion`. |
| 2 PENDIENTE | 3 ASC | 3 RECHAZADO | Cliente | El auxiliar rechazó y pidió que **el cliente** corrija (`modo_solucion=cliente_actualiza`). Va a Mis Documentos, corrige lo marcado "Requiere cambio", pulsa "Actualizar e informar a Cartonera" → vuelve a 3/3/1. |
| 3 REVISION | 3 ASC | 3 RECHAZADO | Auxiliar Servicio Cliente | El auxiliar rechazó pero pidió corregirlo **él mismo** (`modo_solucion=auxiliar_actualiza`). |
| 3 REVISION | 4 OFC | 1 PENDIENTE | Oficial de Cumplimiento | Debe revisar. `PUT :id/concepto-oficial-cumplimiento`. |
| 6 RECHAZADA | 4 OFC | 3 RECHAZADO | — (fin) | Oficial de Cumplimiento rechazó definitivamente. Proceso terminado. |
| 3 REVISION | 5 CC1 | 1 PENDIENTE | Comité de Crédito 1 | Solo deja su revisión (evaluación de riesgo, límite/plazo recomendado, observaciones) y la envía — no aprueba ni rechaza, siempre avanza a Comité de Crédito 2. `PUT :id/concepto-comite-credito-1`. |
| 3 REVISION | 6 CC2 | 1 PENDIENTE | Comité de Crédito 2 | Debe revisar y definir condiciones (cupo, plazo de pago, forma de pago). `PUT :id/concepto-comite-credito-2`. |
| 6 RECHAZADA | 6 CC2 | 3 RECHAZADO | — (fin) | Comité de Crédito 2 rechazó definitivamente. |
| 5 APROBADA | 6 CC2 | 2 APROBADO | — (fin) | Aprobado. Se envía la carta de vinculación por correo con las condiciones pactadas. Proceso completado. |

## Camino feliz (aprobado de punta a punta)

```
1/1/1 (Cliente llenando)
  → 2/2/1 (Ejecutivo Negocios)          [o 2/1/5 primero si hay documentos diferidos]
  → 3/3/1 (Auxiliar Servicio Cliente)
  → 3/4/1 (Oficial de Cumplimiento)
  → 3/5/1 (Comité Crédito 1)
  → 3/6/1 (Comité Crédito 2)
  → 5/6/2 (Aprobada, fin)
```

Cualquier rechazo de Oficial de Cumplimiento o Comité 2 termina el proceso en
`6/etapa-actual/3` (Rechazada, fin). Comité de Crédito 1 no puede rechazar —
solo deja su revisión y siempre avanza a Comité 2. El único rechazo que **no**
termina el proceso es el del Auxiliar Servicio Cliente (etapa 3/ASC): ese
vuelve al cliente o al mismo auxiliar para corregir y reintentar.

## Dónde está la lógica en el código

- Transiciones generales (Cliente → EJN, gate de documentos diferidos): `BACKEND/src/solicitudes/solicitudes-workflow.service.ts::cambiarEstado`
- Envío inicial de una solicitud nueva: `BACKEND/src/solicitudes/solicitudes.service.ts::crearSolicitud`
- Verificación/avance tras subir documentos diferidos: `solicitudes-workflow.service.ts::verificarYAvanzarDocumentosPlantilla`
- Ejecutivo de Negocios → Auxiliar: `solicitudes-workflow.service.ts::guardarGestionEjecutivo`
- Auxiliar Servicio Cliente (aprobar/rechazar con checklist): `solicitudes-workflow.service.ts::aprobarRechazarSolicitud`
- Oficial de Cumplimiento / Comité 2 (aprobar/rechazar genérico): `solicitudes-workflow.service.ts::guardarConceptoGenerico`
- Comité de Crédito 1 (solo revisión, sin aprobar/rechazar, siempre avanza a CC2): `solicitudes-workflow.service.ts::guardarRevisionComiteCredito1`
