# Bug: precarga perdida y formulario servido con versión no activada

> Dos bugs distintos encontrados y corregidos el 2026-07-18, a raíz de que un usuario de prueba reportó que al guardar una solicitud nueva como borrador y volver a abrirla, los datos precargados (y luego incluso datos escritos a mano, como la dirección) aparecían vacíos.

## Síntoma reportado

1. Cliente de prueba ("David Prueba") crea una solicitud, la guarda como borrador. Al reabrirla, los campos que se habían precargado automáticamente (razón social, NIT, etc.) vienen vacíos.
2. Segunda prueba ("David Prueba 2"): crea otra solicitud, escribe manualmente en el campo "Dirección", guarda como borrador. Al reabrir para editar, **todo** el formulario aparece vacío — incluida la dirección que se escribió a mano.

Resultaron ser dos bugs independientes, cada uno con su propio origen, que se solaparon en las pruebas.

---

## Bug 1 — la precarga automática nunca se enviaba al backend en el primer guardado

**Archivo:** `F_PortalClientes/src/app/solicitudes/nueva/SolicitudFormContent.tsx`

### Causa raíz

Para no reenviar todo el formulario en cada "Guardar Borrador", el componente solo envía al backend los campos de `respuestas` que **cambiaron** desde el último guardado (`respuestasCambiadas`, comparando contra `lastSavedResponses.current`).

El problema estaba en cómo se inicializaba ese snapshot de "lo último guardado":

```ts
// ANTES
useEffect(() => {
  if (
    Object.keys(respuestas).length > 0 &&
    Object.keys(lastSavedResponses.current).length === 0
  ) {
    lastSavedResponses.current = JSON.parse(JSON.stringify(respuestas));
    setHasNewChanges(false);
  }
}, [respuestas, loadingInitial]);
```

Este efecto se disparaba apenas `respuestas` tuviera **cualquier** valor — y en una solicitud nueva, `respuestas` ya tiene valores antes de que el usuario guarde nada, por la precarga automática (`usePrefillConfiguracion`, que llena campos desde los datos del cliente o de su última solicitud). Al capturar esos valores como "ya guardados" sin que jamás hubieran llegado al servidor, el primer clic en "Guardar Borrador" no detectaba cambios en esos campos y nunca los incluía en el payload — la precarga se perdía en silencio.

### Fix aplicado

El snapshot ahora solo se inicializa cuando se está **editando una solicitud existente** (`solicitudId` presente, es decir, datos que realmente vienen del servidor). Para una solicitud nueva se deja vacío, así el primer guardado envía todo lo que hay en pantalla, incluida la precarga:

```ts
// DESPUÉS
useEffect(() => {
  if (
    solicitudId &&
    Object.keys(respuestas).length > 0 &&
    Object.keys(lastSavedResponses.current).length === 0
  ) {
    lastSavedResponses.current = JSON.parse(JSON.stringify(respuestas));
    setHasNewChanges(false);
  }
}, [respuestas, loadingInitial, solicitudId]);
```

### Verificación

Se creó una solicitud de prueba real, se guardó como borrador y se confirmó en base de datos que las 15 respuestas (incluida la precarga: razón social, NIT, correo, dirección, etc.) quedaron persistidas en `Formulario_respuesta` desde el primer guardado.

---

## Bug 2 — "nueva solicitud" ignoraba si una versión del formulario estaba activada

Este es el bug más serio: explica por qué, incluso después de corregir el Bug 1, una solicitud de prueba (`sol_id=2186`, cliente "David Prueba 2") seguía viéndose completamente vacía al reabrirla — pese a que sus 15 respuestas sí estaban guardadas en la base de datos.

**Archivo:** `F_PortalClientes/src/hooks/usePreguntasFormulario.ts`

### Contexto: cómo funciona el versionamiento de formularios

El formulario de vinculación admite varias versiones (`Formulario_versiones`). Crear una versión nueva (`POST /parametrizacion/formularios/:id/nueva-version`) es un paso independiente de **activarla** (`PATCH /parametrizacion/formularios/:id/activar-version`) — por diseño, para poder editar un borrador de versión sin que afecte a los clientes hasta que esté lista. La versión activa se guarda en `formularios.frm_version_activa`.

El mismo día del reporte, alguien había creado una versión 10 del formulario desde el editor (`Formulario_versiones.fv_id=14`, descripción "cd" — con pinta de trabajo en curso), agregando preguntas nuevas como "Dirección". Esa versión **nunca se activó**: `formularios.frm_version_activa` seguía en `9`.

### Causa raíz

Al armar el formulario para una solicitud **nueva** (`!solicitudId`), el hook calculaba qué versión de preguntas mostrar así:

```ts
// ANTES
const versionsAvailable = data.map((p) => Number(p.fp_version ?? 1))
  .filter((v, i, arr) => arr.indexOf(v) === i);
const latestVersion = Math.max(...versionsAvailable, 1);

const versionObjetivo = solicitudId
  ? formularioVersionObjetivo
  : latestVersion;   // <- el número de versión MÁS ALTO que exista, activado o no
```

`latestVersion` es literalmente "el `fp_version` más alto que exista entre todas las preguntas de la tabla", sin mirar en ningún momento `formularios.frm_version_activa`. En cuanto existió una pregunta con `fp_version = 10` (la que se acababa de crear en el editor), esa pasó a ser la versión que **cualquier cliente real** veía al abrir "Nueva solicitud" — sin que nadie activara nada.

Mientras tanto, el backend, al crear la fila de la solicitud (`solicitudes.service.ts`, `crearSolicitud`), sí calcula correctamente la versión a partir de `frm_version_activa` (con fallback a la más alta de `Formulario_versiones` solo si `frm_version_activa` es `NULL`):

```sql
SELECT TOP 1 ISNULL(f.frm_version_activa,
  (SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frm_id = f.frm_id)
) AS formulario_version
FROM formularios f WHERE f.frm_activo = 1 ORDER BY f.frm_id
```

Con `frm_version_activa = 9`, la solicitud quedó guardada con `sol_formulario_version = 9`. Pero el cliente había diligenciado y guardado respuestas contra las preguntas de la **versión 10** (`fp_version = 10`, confirmado para las 15 preguntas respondidas, incluida "Dirección").

Resultado: al reabrir la solicitud para editar, `usePreguntasFormulario` carga correctamente las preguntas de `sol_formulario_version = 9` — pero ningún `fp_id` de las respuestas guardadas (todas de la v10) existe en ese conjunto. El formulario se renderiza vacío, aunque los datos siguen intactos en `Formulario_respuesta`.

En otras palabras: **"activar una versión" nunca controlaba lo que veían los clientes en el formulario** — solo controlaba lo que el backend anotaba como versión de la solicitud. Cualquier borrador de versión dejado a medio editar en el editor de formularios se volvía inmediatamente visible (y usable) para clientes reales.

### Fix aplicado

`usePreguntasFormulario` ya recibe la respuesta de `GET /parametrizacion/formularios/activo` (que expone `formulario_version` = `frm_version_activa`) en el mismo `Promise.all` donde se calculaba `latestVersion`. Ahora se usa esa fuente oficial para una solicitud nueva, con `latestVersion` solo como último recurso si no se puede resolver:

```ts
// DESPUÉS
const versionActivaOficial = Number(
  (formularioData as any)?.formulario_version ?? NaN,
);

const versionObjetivo = solicitudId
  ? formularioVersionObjetivo
  : Number.isFinite(versionActivaOficial)
    ? versionActivaOficial
    : latestVersion;
```

Con esto, la misma fuente de verdad (`frm_version_activa`) determina tanto qué preguntas ve el cliente en "Nueva solicitud" como qué versión anota el backend al crear la solicitud — ya no pueden desincronizarse.

### Verificación

- Confirmado en vivo: `GET /parametrizacion/formularios/activo` devuelve `formulario_version: 9`, mismo valor que usa el backend al crear una solicitud.
- Typecheck del frontend limpio tras el cambio.
- Pendiente de probar visualmente en el navegador una solicitud nueva end-to-end (crear → guardar borrador → reabrir) ya con ambos fixes aplicados.

---

## Impacto en datos existentes

Dos solicitudes de prueba quedaron con datos guardados pero "invisibles" en pantalla por el Bug 2, mientras la versión 10 siga sin activar:

| Solicitud | Cliente | `sol_id` | `sol_formulario_version` | Respuestas guardadas |
|---|---|---|---|---|
| #14 | David Prueba 2 | 2185 | — | 8 (antes del fix del Bug 1, precarga no incluida) |
| #15 | David Prueba 2 | 2186 | 9 | 15 (incluye precarga y "Dirección" = "Calle 4b n 34 a 85"), todas de preguntas `fp_version=10` |

No hay pérdida real de datos en la #15 — solo quedaron "huérfanas" de una versión no activada. Si se activa la versión 10, esa solicitud debería volver a mostrar sus datos correctamente (sus respuestas ya corresponden a esa versión). La #14 sí perdió lo que la precarga debía haber guardado en su momento (bug 1, corregido después) — habría que volver a diligenciar esos campos si se quiere conservar esa solicitud de prueba.

## Pendiente / decisión abierta

Activar o no la versión 10 del formulario (creada hoy, descripción "cd", incluye la pregunta "Dirección" entre otras) queda a criterio de quien esté editando el formulario — ya no hay urgencia ni riesgo de que se filtre a clientes reales sin querer, porque el Bug 2 ya está corregido.
