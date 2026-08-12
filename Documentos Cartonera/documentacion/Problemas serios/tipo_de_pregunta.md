# Problemas del tipo de pregunta "Selección desde tabla" (SELECT_TABLA)

Registro de dos limitaciones estructurales encontradas en el mecanismo de
"Configuración de catálogo externo" del editor de preguntas (parametrización),
a raíz de revisar por qué la pregunta "Ciudad" de la sección DATOS DE
IDENTIFICACIÓN no se puede configurar para depender de País/Departamento
usando el checkbox "Filtro de catálogo" del editor. Mismo formato que
`problemas.md`: contexto, evidencia en código, recomendación.

## 1. "Filtro de catálogo" (dependencia entre preguntas) no funciona cuando la pregunta padre es SELECT_TABLA

### Contexto

El editor de preguntas (pantalla "Editar pregunta" → tipo "Selección desde
tabla") tiene una sección "Filtro de catálogo" con la opción "Estas opciones
dependen de la respuesta de otra pregunta". La expectativa natural es
usarla para que, por ejemplo, "Ciudad" solo muestre ciudades del
"Departamento" ya respondido (y éste, del "País" ya respondido) — la misma
cascada país→departamento→ciudad que cualquier formulario de este tipo
necesita.

### El problema

El mecanismo real detrás de ese checkbox es
`fp_catalogo_filtro_pregunta_id` + `fp_catalogo_filtro_reglas`, consumido en
el frontend por `useCatalogoDependiente.ts`
(`F_PortalClientes/src/app/solicitudes/nueva/hooks/useCatalogoDependiente.ts`)
y priorizado en `PreguntaRenderer.tsx` (línea ~482: si
`pregunta.fp_catalogo_filtro_pregunta_id` está seteado, se usa
`catalogoDependienteMap` **en vez de** cualquier otro mecanismo). Tiene dos
problemas que lo hacen inutilizable para una pregunta padre tipo
`SELECT_TABLA` (como Departamento):

1. **Requiere enumerar reglas a mano, no filtra por FK dinámicamente.**
   `fp_catalogo_filtro_reglas` es un JSON de pares
   `{ valor, valor_filtro }` — hay que escribir una fila por cada posible
   respuesta del padre (ej. una por cada uno de los ~33 departamentos de
   Colombia, con su `pai_id` correspondiente como `valor_filtro`), y
   mantenerla si el catálogo cambia. Es lo opuesto al mecanismo que sí
   funciona bien para las columnas `CATALOGO` dentro de una pregunta
   `TABLA` (`catalogo_columna_padre` + `catalogo_columna_filtro`, ver
   `BACKEND/src/cliente-datos-normalizados/cliente-datos-normalizados.service.ts`),
   que resuelve el id del padre dinámicamente contra el catálogo real, sin
   listas a mano.

2. **La resolución del valor del padre está rota para un padre
   `SELECT_TABLA`.** `resolverValorPreguntaDisparadora`
   (`F_PortalClientes/src/app/solicitudes/nueva/lib/resolverValorPregunta.ts`,
   línea ~16-24) trata `SELECT`/`SELECT_TABLA`/`MULTISELECT` igual: lee
   `respuesta.valor_opcion_id` y busca ese id dentro de
   `preguntaDisparadora.opciones` (`Formulario_pregunta_opcion`). Pero una
   pregunta `SELECT_TABLA` como "Departamento" **no** guarda su respuesta en
   `valor_opcion_id` — la guarda en `valor_numero` (confirmado en
   `PreguntaRenderer.tsx` línea ~517: `pregunta.fp_tipo === "SELECT_TABLA"
   ? respuestas[pregunta.fp_id]?.valor_numero : ...valor_opcion_id`), y
   tampoco tiene filas en `Formulario_pregunta_opcion` (sus opciones salen
   de un catálogo real, no de opciones estáticas). Con esto,
   `resolverValorPreguntaDisparadora` sobre una pregunta padre
   `SELECT_TABLA` devuelve siempre `""`.

**Consecuencia si se activa "Filtro de catálogo" en la pregunta Ciudad
apuntando a Departamento como padre**: `valorActual` siempre vacío →
nunca hay `regla` que matchee → `useCatalogoDependiente` deja el catálogo
vacío a propósito (línea ~79: "Sin respuesta del padre o sin regla que
matchee: catálogo vacío, nunca el catálogo completo sin filtrar"). El
dropdown de Ciudad quedaría permanentemente sin opciones, no "filtrado
correctamente" — sería peor que dejarlo sin configurar.

### Por qué País→Departamento→Ciudad "funciona" hoy de todas formas

No es porque "Filtro de catálogo" esté bien configurado — es un mecanismo
totalmente aparte y hardcodeado: `maestroPreguntaIds` en
`SolicitudFormContent.tsx` (línea ~588-628) detecta las preguntas País/
Departamento/Ciudad **buscando texto** en `fp_descripcion` (`/\bpais\b/`,
`/\bdepartamento\b/`, `/\bciudad\b/`), y al responder dispara
`maestrosService.getDepartamentos(pais_id)` / `getCiudades(depto_id)`
directamente — sin pasar por `fp_catalogo_filtro_pregunta_id` en absoluto.

Esto funciona hoy (verificado contra `fp_version = 15`: solo hay una
pregunta "País", una "Departamento" y una "Ciudad" tipo selección en todo
el formulario, todas en la sección 1 = DATOS DE IDENTIFICACIÓN, así que el
primer match siempre es el correcto) pero es en sí mismo otro parche: estas
tres preguntas **ya tienen `fp_codigo` estable** (`AUTO_Q1154`/`AUTO_Q1155`/
`AUTO_Q1156`), y aun así se detectan por coincidencia de texto en la
etiqueta en vez de por ese código. Si alguien agrega otra pregunta con
"ciudad" en el texto antes de la sección 1, o renombra estas preguntas, el
match se rompe en silencio.

### Recomendación

- Corto plazo (bajo riesgo, no toca el motor genérico): cambiar
  `maestroPreguntaIds` para buscar primero por `fp_codigo` (`AUTO_Q1154`/
  `AUTO_Q1155`/`AUTO_Q1156`) y usar el regex de texto solo como respaldo si
  esos códigos no existen en la versión activa del formulario.
- De fondo: si se quiere que "Filtro de catálogo" sirva para más casos que
  el hardcodeado de país/departamento/ciudad (ej. un futuro
  "Ciudad de Expedición" que dependa de otro país en otra sección), hay que
  arreglar los dos puntos de arriba: (1) que la regla de filtro pueda ser
  "usar directamente el id de la respuesta del padre contra
  `fp_catalogo_filtro_columna`" (sin enumerar valores a mano) cuando el
  padre es él mismo un catálogo, y (2) que `resolverValorPreguntaDisparadora`
  lea `valor_numero` para un padre `SELECT_TABLA` en vez de
  `valor_opcion_id`.

## 2. El filtro de "solo filas activas" está adivinado por convención de nombre en el backend, no es configurable desde el editor

### Contexto

El editor de preguntas para "Selección desde tabla" pide Base de datos,
Tabla, Columna visible y Primary Key — no hay ningún campo para indicar
cuál es la columna de "activo/estado" del catálogo externo, ni qué valor
representa "activo".

### El problema

Ese filtro existe, pero vive escondido en el backend, adivinado por
convención de nombre: `MaestrosService.detectarColumnaEstado`
(`BACKEND/src/maestros/maestros.service.ts`, línea ~26-41) busca la primera
columna de la tabla cuyo nombre contenga `estado` o `activo`
(`LIKE '%estado%'`/`LIKE '%activo%'`, priorizando `%estado%`), y
`getCatalogo` (línea ~243-275) arma un `WHERE` con esa columna usando una
lista fija de valores considerados "activo":
`TRY_CONVERT(BIT, [col]) = 1 OR UPPER(...) IN ('TRUE', 'ACTIVO', 'A', 'SI',
'S')`.

Esto ya causó una ambigüedad real: `Ciudads` tiene dos filas "Galapa"
(`ciu_id=10` con `ciu_estado='I'`, `ciu_id=671` con `ciu_estado='A'`) — sin
este filtro, cualquier resolución por nombre (ej. al sincronizar
`cliente_direcciones_envio` desde `ClienteDatosNormalizadosService`) sería
ambigua. Hoy funciona porque el nombre de columna (`ciu_estado`,
`dpto_estado`, `pai_estado`) y los valores (`'A'`/`'I'`) siguen la
convención que `detectarColumnaEstado` espera — pero:

- Es una convención **implícita**, no una configuración explícita del
  catálogo. Un catálogo externo nuevo con una columna llamada `vigente`,
  `habilitado`, o con valores `'ACTIVE'/'INACTIVE'` en vez de `'A'/'I'`, no
  sería detectado — `getCatalogo` traería también las filas inactivas, en
  silencio, sin que el admin que configuró la pregunta tenga forma de
  saberlo ni de corregirlo desde el editor.
- El admin que configura "Selección desde tabla" no tiene visibilidad ni
  control sobre esto: no ve qué columna se está usando como "estado", ni
  puede desactivar el filtro si por algún motivo un catálogo puntual
  necesita mostrar también las inactivas.

### Recomendación

Agregar a la configuración de catálogo externo (mismo bloque donde hoy se
elige Base de datos/Tabla/Columna visible/PK) dos campos explícitos,
opcionales:

- **Columna de estado** (ej. `ciu_estado`) — si se deja vacío, cae al
  comportamiento actual de adivinar por convención de nombre (compatibilidad
  hacia atrás).
- **Valor(es) que cuentan como "activo"** (ej. `A`, o una lista) — mismo
  fallback si se deja vacío.

Esto resolvería ambos problemas de este documento a la vez: el mismo par
(columna de estado, valor activo) que necesita el filtro de "solo activas"
es la pieza que le falta al "Filtro de catálogo" dependiente (problema 1)
para poder filtrar de forma consistente en precarga, en el formulario en
vivo, y en la sincronización hacia `Clientes`/tablas normalizadas
(`ClienteDatosNormalizadosService`).

### Solución implementada (2026-08-09/10)

Se agregaron los dos campos explícitos como se recomendó (migración
`20260809_agregar_columna_estado_catalogo.sql`), pero al usarlos en el
editor se detectó que el nombre elegido inicialmente
(`fp_catalogo_columna_estado`/`fp_catalogo_valor_activo`, expuesto en la UI
como "Columna de estado"/"Valor que cuenta como activo") quedaba quemado a
la semántica de activo/inactivo — no servía para condicionar un catálogo
por cualquier otro criterio (ej. un tipo de fila, una zona, etc.).

Se generalizó en una segunda pasada (migración
`20260810_generalizar_condicion_catalogo.sql`):

- **Nombre**: renombrado a `fp_catalogo_columna_condicion`/
  `fp_catalogo_valor_condicion` (a nivel de pregunta, para `SELECT_TABLA`) y
  `catalogo_columna_condicion`/`catalogo_valor_condicion` (dentro del JSON
  por columna, para columnas `CATALOGO` de una pregunta `TABLA`). **No** se
  llamó "filtro" — ese nombre ya lo usa el mecanismo de dependencia FK de
  este mismo documento (`fp_catalogo_filtro_pregunta_id`/
  `catalogo_columna_filtro`, sección "Filtro de catálogo" de la UI), que es
  un concepto distinto (filtro *dinámico* según la respuesta de otra
  pregunta) y hubiera chocado en nombre con esta condición *estática*.
- **Lógica** (`MaestrosService.getCatalogo`,
  `BACKEND/src/maestros/maestros.service.ts` línea ~192-390): si se
  configura `columnaCondicion`, `valorCondicion` pasa a ser obligatorio
  (validado con `BadRequestException`) y se usa como igualdad exacta
  (`UPPER(...) = UPPER(@valor)`) — sirve para cualquier condición, no solo
  activo/inactivo. Si se dejan ambos vacíos, cae exactamente al
  comportamiento de siempre: `detectarColumnaEstado` adivina la columna por
  convención de nombre (`%estado%`/`%activo%`) y aplica la heurística
  `TRY_CONVERT(BIT,...) = 1 OR ... IN ('TRUE','ACTIVO','A','SI','S')`.
- **UI**: en `ColumnaCatalogoPicker.tsx` y `PreguntaFormCatalogoExterno.tsx`
  (`F_PortalClientes/src/app/parametrizacion/formulario-editor/components/`)
  las etiquetas pasaron a "Condición fija (opcional)" +
  "Valor requerido (obligatorio si eliges columna arriba)".
- **Dato migrado**: al momento del rename, 0 filas de `Formulario_pregunta`
  usaban las columnas top-level, pero 1 pregunta (`fp_id=3010`,
  "Direcciones", con columnas Pais/Departamento/Ciudad) sí tenía las claves
  dentro de `fp_tabla_columnas` — la migración las renombró también dentro
  del JSON ya guardado.
