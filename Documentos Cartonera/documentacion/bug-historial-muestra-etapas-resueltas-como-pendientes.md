# Bug: "Historial de Solicitud" mostraba etapas YA resueltas (Cliente, Ejecutivo de Negocios) como si siguieran pendientes

> Encontrado el 2026-07-21 por el usuario, en
> `http://localhost:3002/solicitudes/gestion-auxiliar-servicio-al-cliente/2187/gestionar`.
> Pregunta del usuario: *"por que dice que falta la respuesta del ejecutivo de
> negocios?"* — la solicitud ya estaba en la bandeja del Auxiliar de Servicio
> al Cliente (o sea que el Ejecutivo de Negocios ya había registrado su
> concepto), pero el panel seguía mostrando el paso "Ejecutivo Negocios" con
> el ícono ámbar "…" y "Pendiente desde: 20 de jul 09:15 p. m.", igual que el
> paso "Cliente" y el paso actual "Auxiliar Servicio Cliente".

Relacionado con [[bug-historial-falso-registrar-concepto-ejecutivo]] (mismo
síntoma superficial — historial engañoso — pero causa raíz distinta y en
capa distinta).

## Causa raíz

**Archivo:** `F_PortalClientes/src/components/historial/HistorialSolicitud.tsx`
(componente COMPARTIDO por todas las pantallas de gestión: Ejecutivo
Negocios, Auxiliar Servicio Cliente, Oficial de Cumplimiento, Comité de
Crédito 1/2 — a diferencia del bug hermano, este no era un problema de una
sola pantalla).

Cada fila de `solicitud_workflow_historial` se graba en el momento en que la
solicitud **entra** a una etapa, con el resultado vigente en ESE momento
(típicamente `PENDIENTE`, porque recién empieza esa etapa) —
ver `historial-workflow.service.ts::registrarTransicionConSLA` y cómo la
invocan `solicitudes-workflow.service.ts::guardarGestionEjecutivo` /
`::aprobarRechazarSolicitud` / `::guardarConceptoGenerico`. Cuando esa etapa
se resuelve y la solicitud avanza, **no se actualiza la fila vieja** — se
inserta una fila nueva para la etapa siguiente. Por diseño, la fila de una
etapa ya resuelta se queda para siempre en la BD con `resultadoNombre =
"Pendiente"`.

El componente decidía el ícono (✓ vs "…") mirando solo ese texto:

```tsx
// ANTES
const esPendiente = Boolean(
  item.resultadoNombre?.toLowerCase().startsWith("pendiente"),
);
```

Como toda etapa ya resuelta también tiene `resultadoNombre` = "Pendiente" en
su fila (por cómo se graba, no por su estado real), **cualquier etapa previa
a la actual se mostraba igual de pendiente que la etapa donde realmente está
la solicitud ahora** — sin distinguir "esto ya pasó" de "esto está pasando
ahora".

## Fix aplicado

Una fila solo puede seguir pendiente si es la **última** del arreglo
(`historial` viene ordenado ascendente por fecha — ver
`historial-workflow.service.ts::obtenerHistorial`, `ORDER BY swh_fecha ASC`):
si existe una fila posterior, esta etapa quedó resuelta sin importar qué
diga su propio `resultadoNombre`.

Además, para una etapa ya resuelta, la fecha correcta de "Gestionado" es la
fecha de la fila SIGUIENTE (el momento en que se disparó la transición que
la superó), no la fecha de su propia fila (que es cuándo *entró* a la etapa,
no cuándo la resolvió):

```tsx
// DESPUÉS
const resultadoEraPendiente = Boolean(
  item.resultadoNombre?.toLowerCase().startsWith("pendiente"),
);
const esPendiente = isLast && resultadoEraPendiente;
const fechaMostrada =
  !isLast && resultadoEraPendiente
    ? historial[index + 1]?.fecha || item.fecha
    : item.fecha;
```

La fila "Creación" (resultado `null`, no "Pendiente") no se ve afectada por
el caso especial — sigue mostrando su propia fecha, correcto porque no es un
ciclo entrar/resolver como las demás etapas.

## Verificación

- Con el fix, para `sol_id=2187`: Creación y Cliente y Ejecutivo Negocios
  pasan a ✓ verde ("Gestionado: <fecha de la transición siguiente>"); solo
  Auxiliar Servicio Cliente (la última fila, la etapa donde está ahora)
  queda en ámbar "…Pendiente desde".
- Typecheck del frontend limpio tras el cambio (`npx tsc --noEmit`).

## Nota

Como el fix está en el componente compartido `HistorialSolicitud.tsx`, no en
una pantalla individual, corrige el problema en TODAS las pantallas de
gestión a la vez (Ejecutivo Negocios, Auxiliar Servicio Cliente, Oficial de
Cumplimiento, Comité de Crédito 1/2), no solo en la que reportó el usuario.
