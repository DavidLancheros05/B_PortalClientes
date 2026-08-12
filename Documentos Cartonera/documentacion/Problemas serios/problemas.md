# Problemas serios

Registro de problemas estructurales detectados (no bugs puntuales) que
conviene resolver antes de construir funcionalidad nueva encima. Formato:
un `##` por problema, con contexto, evidencia en código y recomendación.

## Los datos del formulario no quedan en "tablas del cliente" — bloquea el envío a SIESA

Detectado: 2026-08-09, a raíz de planear el envío de datos a SIESA cuando un
cliente diligencia el formulario (dirección contraria a
`plan-migracion-clientes-siesa.md`, que trae datos DESDE SIESA — este
problema es sobre enviar HACIA SIESA).

### El problema

Cuando un cliente llena el formulario, sus respuestas quedan repartidas en
dos estructuras muy distintas:

1. **`Clientes`** (`BACKEND/src/clientes/entities/clientes.entity.ts`) — tabla
   normalizada pero mínima: una sola dirección (`cli_direccion`,
   `pai_id`/`dpto_id`/`ciu_id`), un solo correo, un solo ejecutivo
   (`ejng_id`). No tiene columnas para múltiples puntos de envío, contactos
   por área, representante legal, ni composición accionaria.
2. **`Formulario_respuesta`**
   (`BACKEND/src/solicitudes/entities/solicitud-respuesta.entity.ts`) — EAV
   genérico, una fila por pregunta (`fr_solicitud_id` + `fr_fp_id` +
   `fr_valor_*`).

El problema está en las secciones del formulario que son "tabla" (relación
1-a-muchos): Direcciones/puntos de envío, Contactos por área, Representante
legal y suplentes, Composición accionaria, Personas beneficiarias comercio
exterior. Son justo las secciones que en `plan-migracion-clientes-siesa.md`
corresponden a tablas reales de SIESA con relación 1-a-muchos
(`t215_mm_puntos_envio_cliente`, `t2008`/`t2013_mm_otros_contactos_*`).

Pero en el portal, una pregunta tipo `TABLA`
(`BACKEND/src/parametrizacion/formulario-preguntas/entities/formulario-pregunta.entity.ts`,
enum `TipoPregunta.TABLA`) **no genera filas normalizadas** — se guarda como
**un solo JSON de texto** en `fr_valor_texto`
(`BACKEND/src/solicitudes/formulario-renderizable.service.ts:238,544`), con
claves de columna definidas en `fp_tabla_columnas`: **texto libre editable
desde Parametrización**, sin esquema fijo ni tipos.

### Por qué esto bloquea el envío a SIESA

- **No existe "la tabla del cliente"** con sus puntos de envío/contactos —
  solo existen "las respuestas de esta solicitud". El dato vive atado a
  `sol_id`, no a `cli_id`.
- Aprobar una solicitud **no sincroniza nada de vuelta a `Clientes`** —
  verificado: no hay ningún `UPDATE Clientes` en el flujo de aprobación
  (`solicitudes-workflow.service.ts` y afines), el único `UPDATE Clientes`
  del código está en `users.service.ts` (cambio de contraseña/perfil, sin
  relación).
- Para armar el payload hacia SIESA (ej. las filas de
  `t215_mm_puntos_envio_cliente`) hay que: ubicar el `fp_id` de la pregunta
  `TABLA` correcta, parsear el JSON de `fr_valor_texto`, y mapear claves de
  columna que **un administrador puede renombrar en cualquier momento**
  desde Parametrización, sin migración ni versionado — eso rompe en
  silencio cualquier mapeador que asuma esas claves fijas.
- El único mecanismo de estabilidad que ya existe hoy es `fp_codigo` (usado
  para anclar `REP_LEGAL_TABLA` en
  `BACKEND/src/solicitudes/solicitudes.controller.ts:585`, pensado
  originalmente para que los placeholders de plantillas de documento
  sobrevivan renames) — pero es opcional, no está confirmado que todas las
  preguntas `TABLA` lo tengan puesto.
- El módulo pensado para esta integración,
  `BACKEND/src/integraciones/uno/` (`uno.service.ts`, `uno.module.ts`,
  `entities/integracion-uno.entity.ts`, `retry.job.ts`), sigue siendo un
  stub completamente vacío — `UnoModule` ni siquiera está importado en
  `app.module.ts` (mismo punto de partida que ya se documentó en
  `plan-migracion-clientes-siesa.md` para la dirección SIESA→portal).

### Decisión tomada (2026-08-09)

Materializar tablas normalizadas por sección (ej. `cliente_direcciones_envio`,
`cliente_contactos_area`), pobladas al aprobar la solicitud, en vez de
parsear el JSON al vuelo en cada envío a SIESA. Dos precisiones sobre cómo:

1. **Nomenclatura propia del portal, no calcada de SIESA** — columnas tipo
   `cde_direccion`, `cde_pai_id`, etc. (convención de prefijos ya usada en
   el resto del esquema). El mapeo a nombres/códigos de SIESA
   (`f215_direccion1`, códigos de país/depto/ciudad todavía sin catálogo de
   equivalencias — ver `plan-migracion-clientes-siesa.md`) se hace **solo**
   dentro de `BACKEND/src/integraciones/uno/` al armar el payload de salida,
   no en el esquema del portal. Así el portal no queda acoplado al esquema
   interno de SIESA, que además puede cambiar por fuera de este proyecto.
2. **Clave: `cli_id`, no `sol_id`** — para que "los puntos de envío del
   cliente" sea una sola verdad consultable y sobreescribible, en vez de un
   histórico por solicitud. El histórico de qué se llenó en cada solicitud
   puntual ya queda cubierto por `Formulario_respuesta`, que no se toca.

### Riesgo adicional: nuevas versiones del formulario (agregar/quitar/renombrar campos)

Revisado `copiarPreguntasAVersion`
(`BACKEND/src/parametrizacion/formularios/formularios.service.ts:528`), que
es lo que corre al crear una versión nueva de un formulario:

- **Cada versión nueva es un clon completo** de la versión de origen: todas
  las columnas de `Formulario_pregunta` (incluida `fp_codigo` y
  `fp_tabla_columnas`) se copian tal cual a filas con `fp_id` **nuevos**
  (identity) bajo el `fp_version` nuevo. El admin edita la copia después
  (agrega/quita preguntas, cambia columnas de una `TABLA`) sin que quede
  ningún versionado de "qué cambió" — no hay diff, ni migración, ni
  registro de que una columna se renombró vs. se agregó una nueva.
- **`fp_tabla_columnas` sigue siendo texto libre** (array de etiquetas,
  sin un identificador estable por columna) — a diferencia de `fp_codigo`
  a nivel de pregunta, no existe un "código" por columna dentro de una
  `TABLA`. Si en la v2 alguien renombra la columna "País" a "País de
  origen", para el mapeador que puebla las tablas normalizadas es
  indistinguible de que esa columna desapareció y apareció una columna
  nueva sin dato.
- **Cada solicitud queda anclada a `sol_formulario_version`** (confirmado en
  `solicitud.entity.ts` y usado en `formulario-renderizable.service.ts`,
  `ampliacion-cupo.service.ts`, etc.) — o sea, las respuestas de una
  solicitud vieja siempre se leen contra las preguntas de SU versión, nunca
  contra "la versión actual". Esto es bueno (evita que una solicitud v1 se
  intente leer con las preguntas de v2), pero implica que el mapeador hacia
  las tablas normalizadas **debe resolver la pregunta `TABLA` por
  `(fp_codigo, sol_formulario_version)` de la solicitud que se está
  aprobando**, nunca por `fp_id` fijo ni por "la versión más reciente" —
  si se hardcodea un `fp_id`, deja de encontrar la pregunta en cuanto se
  publique una versión nueva.

**Consecuencia práctica por tipo de cambio en una versión nueva:**

| Cambio en la v2 | Qué le pasa al mapeador si no se actualiza a mano |
|---|---|
| Renombrar la etiqueta de una columna de una `TABLA` (ej. "País" → "País de origen") | Deja de encontrar esa clave en el JSON → el campo queda `NULL` en la tabla normalizada, en silencio, sin error |
| Agregar una columna nueva a una `TABLA` (ej. "Zona franca") | El dato nuevo no tiene columna destino en la tabla normalizada → se descarta, salvo que alguien agregue la columna a mano (migración + código) |
| Quitar una columna de una `TABLA` | La columna correspondiente en la tabla normalizada queda `NULL` para solicitudes de la v2 en adelante — inofensivo si es opcional, pero puede reventar en el momento de armar el envío a SIESA si ese campo era obligatorio ahí |
| Quitar la pregunta completa (o desactivarla) | Igual que arriba, pero para toda la sección — sin ningún aviso de que dejó de venir del formulario |

**Implicación para la implementación:** parametrización de preguntas
`TABLA` está pensada para que un admin la edite sin tocar código — pero en
cuanto una de esas preguntas alimenta el envío a SIESA, esa libertad deja
de ser gratis. Antes de implementar, conviene:

1. Agregar un identificador estable por columna dentro de `fp_tabla_columnas`
   (equivalente a `fp_codigo` pero a nivel de columna), para que el
   mapeador ancle por código y no por etiqueta de texto — el admin puede
   seguir renombrando la etiqueta visible sin romper nada.
2. Si eso no se hace, como mínimo: validar en el momento de aprobar/publicar
   una versión nueva que las preguntas `TABLA` marcadas como "usadas por
   SIESA" no perdieron ninguna columna esperada — falla explícita en vez de
   dato perdido en silencio.

Este problema es el espejo, en dirección portal→SIESA, del ya documentado en
`plan-migracion-clientes-siesa.md` (SIESA→portal) — y potencialmente más
delicado, porque del lado del portal el dato es JSON de texto libre, no
columnas tipadas, y ese texto libre puede cambiar de forma libre en cada
nueva versión del formulario.
