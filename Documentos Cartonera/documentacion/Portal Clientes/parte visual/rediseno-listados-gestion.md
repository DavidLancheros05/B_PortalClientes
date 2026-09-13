# Rediseño visual de los listados de "gestión" + componentes reutilizables

## Contexto

Las pantallas de listado donde cada rol interno (Ejecutivo de Negocios, Auxiliar
Servicio Cliente, Oficial de Cumplimiento, Comité de Crédito 1/2) revisa sus
solicitudes pendientes (`FRONTEND/src/app/solicitudes/gestion-*/page.tsx`) eran
casi idénticas en estructura pero cada una con su propio markup copiado a mano:
tarjeta de título separada, tarjeta de filtros separada, emoji `📭` para "sin
resultados", tabla pegada a los bordes de su tarjeta, botón de acción alineado
a la izquierda. Cualquier ajuste de estilo había que repetirlo archivo por
archivo.

Se rediseñaron las 5 páginas de gestión:
**`gestion-ejecutivo-negocios/page.tsx`**,
**`gestion-oficial-de-cumplimiento/page.tsx`**,
**`gestion-auxiliar-servicio-al-cliente/page.tsx`**,
**`gestion-comite-credito-1/page.tsx`** y
**`gestion-comite-credito-2/page.tsx`**, y además
**`listado-de-solicitudes/page.tsx`** (listado general de todas las
solicitudes, para ADMIN/ejecutivo — no es parte de la familia `gestion-*` pero
tenía el mismo problema de tarjeta-de-título+tarjeta-de-filtros+emoji, así que
se le aplicó el mismo patrón). De paso se extrajeron a componentes/utilidades
compartidas las partes que eran puro copy-paste (ver sección siguiente), para
que la próxima página de gestión que se agregue no tenga que repetir el
patrón a mano.

## Patrón visual aplicado

- Fondo de página: `bg-[linear-gradient(180deg,#f6f8fc,#eef1f7)]` (antes
  variaba: `bg-gray-50`, `bg-gradient-to-br from-blue-50 ...`, etc.), con
  contenedor `max-w-[115rem] mx-auto` (antes `max-w-6xl`, insuficiente para
  tablas de 10-12 columnas).
- Un solo `PageHeaderCard` fusiona lo que antes eran dos tarjetas (título +
  filtros): header con gradiente de marca, botón volver, icono, eyebrow +
  `<h1>`, y los filtros debajo separados por `border-top` en vez de vivir en
  una tarjeta aparte.
- Estados "sin buscar" / "sin resultados": `EmptyStateCard` con icono
  `PackageOpen` de lucide en vez del emoji `📭`.
- Tabla de resultados: `ResultsToolbar` (contador "Mostrando N solicitud(es)"
  + `ExportExcelButton`) y la tabla envuelta en `TableContainer` (margen +
  borde propio, ya no pegada a los bordes de la tarjeta).
- Columna "Acción"/"Gestionar"/"Registrar Concepto": header con
  `text-align: right` y celda alineada a la derecha; botón en azul de marca
  sólido (`#003d99` / hover `#0047b3`).
- Badge de estado: `getEstadoBadgeClass` (`@/lib/workflow-labels`) en vez de
  ternarios de color copiados y desincronizados del mapeo real (en
  `gestion-oficial-de-cumplimiento` el ternario ni siquiera cubría los
  estados 5/6 y pintaba "Revisión" de verde en vez de morado).
- Badge de días restantes: `DiasRestantesBadge` — píldora con color por rango
  (vencido = rojo, hoy/≤3 días = ámbar, resto = verde), reemplazando en
  `gestion-oficial-de-cumplimiento` un número plano que además recortaba
  (`Math.max(0, ...)`) los días vencidos a 0, ocultando que la solicitud
  estaba fuera de plazo.

## Componentes/utilidades nuevas (reusar en las páginas de gestión pendientes)

- **`src/lib/date-utils.ts`** — se agregaron `formatDate` / `formatDateTime`
  (estaban duplicadas en `gestion-ejecutivo-negocios` y con variantes sutiles
  en `listado-de-solicitudes`, `mis-documentos`, etc.). `listado-de-solicitudes`
  se rediseñó visualmente pero **conservó su propio `formatDateTime` local**
  (incluye segundos, formato distinto al compartido) para no arriesgar esa
  variante; solo `gestion-*` usan la función compartida.
- **`src/components/badges/DiasRestantesBadge.tsx`** — exporta
  `calcularDiasRestantes(fecha)`, `getDiasRestantesDisplay(dias)` (para usos
  fuera de JSX, ej. exportar a Excel) y el componente
  `<DiasRestantesBadge fecha={...} />` listo para una celda de tabla.
- **`src/components/PageHeaderCard.tsx`** — props: `icon`, `eyebrow?`,
  `title`, `subtitle?`, `onBack`, `actions?` (botón(es) extra a la derecha del
  título), `children?` (slot de filtros, se renderiza con `border-top`).
  Pensado para acomodar también el header de `rechazadas-ejecutivo/page.tsx`
  (usa `subtitle` + `actions` en vez de `eyebrow`) aunque esa página no se
  migró todavía a este componente.
- **`src/components/EmptyStateCard.tsx`** — props: `icon`, `title`,
  `subtitle?`.
- **`src/components/tables/ResultsToolbar.tsx`** — props: `count`, `label?`
  (default `"solicitud(es)"`), `onExport`.
- **`src/components/tables/TableContainer.tsx`** — sin props más que
  `children`, aplica el margen/borde estándar alrededor de una tabla.

`TablePagination` y `ExportExcelButton` (ya existían en
`src/components/tables/`) no cambiaron — ya seguían este mismo criterio de
componente compartido.

## Íconos de header por página

Cada `PageHeaderCard` usa un icono de lucide relacionado con el rol dueño de
la bandeja: `FileText` (Ejecutivo de Negocios), `Headset` (Auxiliar Servicio
al Cliente), `ShieldCheck` (Oficial de Cumplimiento), `Landmark` (Comité de
Crédito 1 y 2), `ClipboardList` (Listado de solicitudes, general).

## Notas de `listado-de-solicitudes/page.tsx`

- No tiene columna "Días faltantes" ni badge de estado (el estado se muestra
  como texto plano) — es una tabla de 21 columnas orientada a auditoría/export,
  no a que el usuario actúe fila por fila, así que no se le agregó
  `DiasRestantesBadge`/`getEstadoBadgeClass` (`getEstadoBadgeClass` sigue
  importado pero sin usar, igual que antes del rediseño).
- `ResultsToolbar` se usó con `label="solicitud(es) encontrada(s)"` para
  conservar el texto original ("Mostrando N solicitud(es) encontrada(s)") en
  vez del default `"solicitud(es)"`.
- Se conservan tal cual: el modal `ConfirmModal` de eliminar (solo ADMIN) y
  las 3 tarjetas de resumen (Total/Con cliente/Con ejecutivo) debajo de la
  tabla.

## Pendiente

- Evaluar si vale la pena migrar `rechazadas-ejecutivo/page.tsx` a
  `PageHeaderCard` (ya usa el mismo gradiente a mano, pero con `subtitle` +
  botón de info en vez de `eyebrow`).
