# Diagnóstico: llaves primarias, foráneas y unique — tablas de solicitudes y workflow

Revisión hecha en vivo contra la base de datos real (`sys.tables`, `sys.key_constraints`,
`sys.indexes`, `sys.foreign_keys`), no contra `DATABASE.md` (desactualizado desde mayo 2026).

Tablas cubiertas: `solicitudes`, `Solicitud_archivo`, `Solicitud_soporte_analisis`,
`solicitud_workflow_historial`, `Solicitudes_estados_hist`, `solicitud_estados`,
`workflow_etapas`, `workflow_estado_etapa`, `Motivos_rechazo_solicitud`,
`param_dias_respuesta_solicitudes`, más los hallazgos colaterales `Solicitud_adjunto`,
`Solicitud_desarrollo` y `Solicitud_documento_deprecated`.

## 🔴 Crítico

**1. `solicitudes` no tiene llave primaria.** Es un HEAP (sin índice clúster ni constraint
PK/UNIQUE). `sol_id` es `IDENTITY` pero nada a nivel de motor garantiza su unicidad ni le da
estructura física a la tabla más importante del sistema.

**2. `sol_numero_solicitud`** (el número de solicitud visible al usuario) **tampoco tiene
UNIQUE** — hoy no hay duplicados, pero nada en el esquema lo impide.

**3. Casi ninguna relación real tiene FK declarada.** Solo existen 3 FK en todo el dominio de
solicitudes:
- `solicitudes.sol_estado_id → solicitud_estados`
- `solicitudes.sol_etapa_actual_id → workflow_etapas`
- `solicitudes.sol_resultado_etapa_id → workflow_estado_etapa`

Ninguna de estas otras columnas, que claramente son FK por nombre y uso en el código, está
declarada como tal: `sol_cliente_id`, `sol_co_id`, `sol_motivo_rechazo_id`, `sol_usuario_*`,
`Solicitud_archivo.sa_sol_id`, `sa_fp_id`, `Solicitud_soporte_analisis.ssa_sol_id`/
`ssa_wet_id`, `solicitud_workflow_historial.swh_sol_id`/`swh_etapa_id`/`swh_resultado_id`/
`swh_usuario_id`, `Solicitudes_estados_hist.seh_sol_id`/`seh_estado_id`/`seh_usr_id`. Toda la
integridad referencial vive solo en el código de aplicación.

**4. Esa ausencia de FK ya causó basura real en producción.** Se comparó cada tabla contra
los 4 `sol_id` que existen hoy (1173, 1174, 2174, 2175) y se encontraron huérfanos apuntando
a solicitudes que ya no existen (rango ~1133–1172, borradas en algún momento sin cascada):

| Tabla | Huérfanas / Total |
|---|---|
| `Solicitud_archivo` | 53 / 69 (77%) |
| `solicitud_workflow_historial` | 61 / 91 (67%) |
| `Solicitudes_estados_hist` | 72 / 92 (78%) |
| `Solicitud_soporte_analisis` | 0 / 4 (tabla nueva, sin problema aún) |

Es decir, la mayoría del historial y de los documentos que hoy tiene la BD pertenece a
solicitudes fantasma. Si algún reporte hace `SELECT` directo sobre estas tablas sin
`INNER JOIN` a `solicitudes`, va a arrastrar basura.

## 🟡 Medio

**5. Constraints UNIQUE duplicados** (dos constraints distintos protegiendo la misma columna,
señal de migraciones corridas dos veces o sin control):
- `solicitud_estados.ses_codigo`
- `workflow_etapas.wet_codigo`
- `workflow_estado_etapa.wee_codigo` (uno de los dos se llama
  `UQ_workflow_resultados_codigo` — nombre que ni siquiera coincide con la tabla, rastro de
  un rename o copy-paste de otra migración)

**6. Tablas homónimas de otro sistema, con datos reales:** `Solicitud_adjunto` (36 filas, FK
a `Muestras`) y `Solicitud_desarrollo` (97 filas, FK a `Clientes`/`Centro_operacion`) — no las
usa ningún archivo en `BACKEND/src` actual. Por el nombre parecen pertenecer al dominio de
solicitudes del portal, pero en realidad son de otro módulo (¿muestras/desarrollo comercial
preexistente?) que comparte la misma base de datos. Riesgo de que alguien las confunda con
las tablas del flujo de vinculación.

**7. `Solicitud_documento_deprecated`**: HEAP sin PK, sin FK, sin ninguna referencia en el
código (consistente con lo que ya dice `CLAUDE.md`: fue reemplazada por `Solicitud_archivo`)
— candidata a archivar/eliminar formalmente, ya no es solo "deprecada en el código" sino
huérfana también a nivel de esquema.

## ✅ Lo que sí está bien

- Las 3 FK del núcleo del *state machine* (`estado`/`etapa`/`resultado`) existen y hoy no hay
  ninguna de las 4 solicitudes vivas con estado/etapa/resultado inválido.
- No hay duplicados de `sol_numero_solicitud` todavía.
- `sa_fp_id` en `Solicitud_archivo` no tiene huérfanos contra `Formulario_pregunta` hoy.
- Ya existen índices no-únicos de apoyo sobre `sol_cliente_id`, `sol_estado_id`,
  `sol_etapa_actual_id`, `sol_resultado_etapa_id` (buenos para performance de listados,
  aunque no reemplazan una FK).

## Recomendación de orden de arreglo

1. PK en `solicitudes.sol_id` + UNIQUE en `sol_numero_solicitud` (bajo riesgo: solo 4 filas
   hoy).
2. Limpiar o migrar a una tabla de archivo los huérfanos ya detectados en
   `Solicitud_archivo`, `solicitud_workflow_historial` y `Solicitudes_estados_hist` —
   **necesario antes** de poder agregar las FK correspondientes (si no, el `WITH CHECK`
   fallará al crearlas).
3. Agregar las FK faltantes listadas en el punto 3 (probablemente con `ON DELETE NO ACTION`
   para preservar auditoría, pero declaradas).
4. Eliminar los UNIQUE duplicados.
5. Decidir qué hacer con `Solicitud_adjunto`/`Solicitud_desarrollo` (documentar que son de
   otro dominio) y con `Solicitud_documento_deprecated` (archivar/borrar).
