# Parte visual del Portal de Clientes

## Dónde viven los tokens de color

`FRONTEND/src/app/globals.css` define las variables de marca (Tailwind v4,
bloque `@theme inline` — cualquier variable ahí genera automáticamente
clases de utilidad):

| Token | Valor | Clases que genera | Uso |
|---|---|---|---|
| `--brand-600` | `#003d99` | `bg-brand-600`, `text-brand-600`, `border-brand-600` | Azul principal: botones sólidos, header, íconos |
| `--brand-700` | `#0047b3` | `hover:bg-brand-700` | Hover de botones sólidos (más oscuro) |
| `--brand-500` | `#0050c7` | `focus:ring-brand-500`, `to-brand-500` | Extremo claro de gradientes, anillo de foco |
| `--page-from` / `--page-to` | `#f6f8fc` / `#eef1f7` | `from-page-from`, `to-page-to` | Fondo de página en listados/gestión |
| `.bg-brand-gradient` | — | `bg-brand-gradient` | Gradiente de header a 120° (`linear-gradient(120deg, brand-600, brand-500)`) — no es un token de Tailwind sino una clase CSS aparte porque 120° no coincide con ninguna dirección fija de `bg-gradient-to-*` |

**Regla**: si vas a escribir un color de marca en una página nueva, usa el
token (`bg-brand-600`, `bg-brand-gradient`, etc.), no el hex directo
(`bg-[#003d99]`). Si necesitas un color que no está en la tabla, primero
evalúa si de verdad es un color nuevo o es el mismo azul con un typo (ver
"Inconsistencias" abajo antes de inventar uno).

Migrados a estos tokens (2026-09-12): `PageHeaderCard.tsx`, `Header.tsx`,
`TablePagination.tsx`, `SolicitudesContent.tsx`, `perfil/page.tsx`,
`dias-respuesta/page.tsx`, `listado-de-solicitudes/page.tsx`,
`[id]/detalle/page.tsx`, `rechazadas-ejecutivo/page.tsx`, y las 5 familias
`gestion-*` (listado + `[id]/gestionar` donde aplica).

## Componentes compartidos ya existentes

No hay una librería de componentes formal (tipo Storybook), pero sí piezas
reutilizables que **deben preferirse sobre copiar markup de otra página**:

- **`src/components/PageHeaderCard.tsx`** — encabezado estándar con
  gradiente de marca, botón volver opcional, icono, título/subtítulo y slot
  para filtros. Ver [`rediseno-listados-gestion.md`](rediseno-listados-gestion.md).
- **`src/components/EmptyStateCard.tsx`** — estado "sin resultados" con
  icono de lucide (reemplaza emojis sueltos como `📭`).
- **`src/components/tables/ResultsToolbar.tsx`** y
  **`src/components/tables/TableContainer.tsx`** — contador de resultados +
  export, y contenedor estándar de tabla.
- **`src/components/badges/DiasRestantesBadge.tsx`** — píldora de días
  restantes con color por rango (vencido/rojo, ≤3 días/ámbar, resto/verde).
- **`src/components/filters/FilterField.tsx`** y
  **`src/components/filters/FilterActions.tsx`** — formulario de filtros
  estándar. `FilterField` envuelve cada `label` + input/select y reserva
  siempre la misma altura de label (`min-h-[2rem]`) sin importar si el
  texto ocupa 1 o 2 líneas, así todos los inputs de la fila arrancan en la
  misma Y aunque tengan labels de distinto largo. `FilterActions` es la
  fila de botones (Buscar/Limpiar, etc.) — **siempre va en su propia fila
  completa, centrada, debajo de todos los `FilterField`** (se usa con
  `className="col-span-full"` en el grid contenedor para forzar el salto de
  línea en cualquier breakpoint), nunca comparte fila con los inputs.
  Nace de un bug real en `solicitudes/cliente/SolicitudesContent.tsx`
  (2026-09-12): esa página no había pasado por el rediseño de
  `rediseno-listados-gestion.md` y tenía su propia fila de filtros a mano,
  con `flex items-end` para alinear los botones junto a los inputs —
  funcionaba solo por casualidad (dependía de qué tan alto fuera el label
  más largo de las otras columnas), y al acortar/alargar un label los
  botones quedaban montados sobre los inputs o pegados a un costado en vez
  de centrados. **Cualquier fila de filtros nueva debe usar estos dos
  componentes, no repetir el patrón a mano.** `FilterField` soporta `ref`
  (via `forwardRef`) para los campos de autocompletar que necesitan
  detectar clic-afuera y cerrar su lista de sugerencias.

  Migradas a estos componentes (2026-09-12): `SolicitudesContent.tsx`,
  `gestion-ejecutivo-negocios`, `gestion-auxiliar-servicio-al-cliente`,
  `gestion-comite-credito-1`, `gestion-comite-credito-2`,
  `gestion-oficial-de-cumplimiento`, `listado-de-solicitudes`,
  `rechazadas-ejecutivo`, y la fila de filtros (no el formulario de "crear
  nuevo", que es un form de datos distinto) de
  `parametrizacion/dias-respuesta`. Es decir, **todas** las páginas con fila
  de filtros del proyecto ya usan el componente compartido.

  También migrada (fuera de `solicitudes/`): **`pedidos/mis-pedidos`**
  (2026-09-13) — esta página no había pasado por ningún rediseño anterior:
  tenía el patrón viejo completo (`bg-white/70 backdrop-blur-sm` +
  `max-w-[90%]`, azules genéricos `blue-600` en vez de tokens de marca,
  textos planos en vez de `EmptyStateCard`). Se migró a `PageHeaderCard` +
  tokens de marca + `FilterField`/`FilterActions` + `EmptyStateCard`. De
  paso se le cambió el comportamiento de filtrado: antes filtraba en vivo
  con cada tecla (`useMemo` directo sobre el estado del input, sin botón
  Buscar); ahora separa estado "borrador" (input) de estado "aplicado"
  (el que de verdad filtra), con `handleBuscar` copiando uno al otro —
  igual que el resto de páginas de listados, a pedido explícito del
  usuario tras notar la inconsistencia.

  También migrado completo (2026-09-13): el **módulo `consultas/`**
  (`remisiones`, `facturas`, `existencias`, `cartera` — el índice
  `consultas/page.tsx` no se tocó, es solo un menú de tarjetas sin
  filtros). Tenían un patrón más viejo todavía que `mis-pedidos`: fondo
  plano `bg-gray-50` sin gradiente, `<h1>` suelto con un link de texto
  "← Volver" en vez de tarjeta de header, sin `ResultsToolbar`/
  `TableContainer`/`TablePagination`/exportar a Excel, y filtrado en vivo
  sin botón Buscar. Se migraron con el mismo tratamiento completo que
  `mis-pedidos`: `PageHeaderCard` (íconos `Truck`/`Receipt`/`Warehouse`/
  `Wallet` de lucide-react), tokens de marca, `FilterField`/
  `FilterActions`, filtrado por clic en Buscar con `hasSearched`,
  `EmptyStateCard`, y se les agregó `ResultsToolbar` + `TableContainer` +
  `TablePagination` + exportar a Excel (antes ninguna de las 4 lo tenía).
  Es decir, **todo el árbol de navegación "Consultas" y "Pedidos" del
  portal** ya sigue el mismo patrón visual que `solicitudes/`.

  También migrado completo (2026-09-13): el **módulo `seguridad/`**
(`roles` + `rolModal`, `modulos`, `usuarios` + `usuarioModal` +
`UsuarioCentrosModal`, `usuario-roles`, `permisos-por-pagina`,
`consecutivos/consecutivos`, `consecutivos/tipo-consecutivo`) — ver
[`rediseno-seguridad.md`](rediseno-seguridad.md) para el detalle fase por
fase. Antes de esta pasada, `seguridad/` no había entrado en ningún
barrido: cada página tenía su propio color de acento (índigo en Roles,
azul en Módulos/Usuarios/Consecutivos, morado en Tipo de Consecutivo) y una
mezcla de `alert()`/`confirm()` nativos con los modales compartidos. Se
unificó todo a los tokens de marca (decisión explícita: un solo color de
header para todo el proyecto, no un acento por página) y se reemplazaron
~15 sitios de `alert()`/`confirm()` nativos por `ConfirmModal`/
`SuccessModal`/`ErrorModal`. El formulario de "Nuevo Módulo" (antes inline
y siempre visible, única página de `seguridad/` con ese patrón) se movió a
modal para igualar a Roles/Usuarios/Consecutivos. De paso se corrigieron
dos huecos reales encontrados al migrar: un `<select>` con dos opciones
`value=""` en `consecutivos/consecutivos` que bloqueaba elegir "Global"
por el `required`, y la falta total de confirmación al quitar un rol
asignado en `usuario-roles` (antes: clic = borrado inmediato).

También migrado (2026-09-13): el **módulo `parametrizacion/`** — 12 de
  sus páginas (`estados`, `tipos-vigencia`, `motivos-rechazo`,
  `formulario-tipos-pregunta`, `correos-por-rol`, `formatos-de-correos`,
  `formato-envio-correos`, `clientes`, `clientes/acceso`, `documentos`
  (`DocumentosClient.tsx`), `formularios`, `formulario-preguntas`,
  `formulario-secciones`). `clientes/acceso` se migró en una pasada
  posterior — es una subruta que no apareció en el barrido inicial por
  `find ... -name page.tsx` (si existe, `find` sí la habría listado; el
  barrido original solo se hizo sobre los archivos listados por el
  `Glob`/`find` de esa sesión, y esta ruta se pasó por alto igual). Antes
  de dar un módulo por completo, conviene revisar si hay subrutas
  (`[algo]/subpagina/page.tsx`) que el listado inicial no haya mostrado.
  Dos
  variantes de tratamiento según el tipo de página:
  - **Listados con filtros** (`estados` sin filtros solo llevó
    `PageHeaderCard`; `motivos-rechazo`, `formulario-tipos-pregunta`,
    `clientes`, `documentos`, `formularios`, `formulario-secciones` sí):
    mismo patrón completo (`PageHeaderCard` + tokens + `FilterField`/
    `FilterActions`). `clientes` y `documentos` ya tenían `hasSearched`
    y separación borrador/aplicado desde antes — no hubo que tocar el
    comportamiento, solo el envoltorio visual.
  - **Editores tipo sidebar+formulario** (`formatos-de-correos`,
    `formato-envio-correos`, `correos-por-rol`): no tienen fila de
    filtros real (es un selector maestro-detalle), así que solo se les
    tocó el header (`PageHeaderCard`) y los botones/acentos sólidos de
    azul genérico → tokens de marca.

  `carta-pdf-vinculacion/page.tsx` **no se tocó**: es solo un redirect a
  `/parametrizacion/documentos` desde que esa pantalla se fusionó ahí en
  julio de 2026, no tiene UI propia.

  Patrón repetido varias veces al migrar páginas viejas: tenían un
  wrapper `bg-white/70 backdrop-blur-sm rounded-3xl ... p-6 md:p-8`
  envolviendo TODO (header+filtros+tabla+stats) como una sola tarjeta.
  Al quitarlo para usar `PageHeaderCard` (que ya es su propia tarjeta),
  queda un `</div>` de cierre sobrante al final del archivo — hay que
  encontrarlo y quitarlo, si no el archivo no compila.

  También migrado (2026-09-13): el **módulo `pqrs/`** — `bandeja` (sin
  filtros, dos tablas asignadas/disponibles), `mis-pqrs` (buscador +
  chips de estado por color dinámico del backend). El buscador se
  envolvió en `FilterField` y usa `FilterActions` (Buscar/Limpiar) igual
  que el resto del proyecto — en el primer intento se dejó filtrando en
  vivo sin botones, se corrigió después. Los chips de estado sí quedan
  con toggle inmediato (clic = aplica al instante, sin pasar por
  Buscar): es un multi-select de un clic, no un campo de texto, y forzar
  ese mismo patrón ahí se sentiría raro. "Limpiar" en `FilterActions`
  resetea buscador + chips + paginación a la vez. Además 4 pantallas
  placeholder sin datos reales todavía (`historial`, `pendientes`,
  `reportes`, `aprobaciones` — cada una es solo un `PageHeaderCard` +
  `EmptyStateCard` con un mensaje fijo). `pqrs/listado` reexporta
  `pqrs/page.tsx` (el índice de tarjetas del módulo) — **no se tocó**,
  mismo criterio que `consultas/page.tsx`/`pedidos/page.tsx`: es un menú,
  no un listado con filtros. Pendiente si se quiere migrar el índice.

  De aquí salió una extensión real a un componente compartido:
  **`EmptyStateCard` ahora acepta `action?: ReactNode`** (antes solo
  `icon`/`title`/`subtitle`) — hacía falta para no perder el botón
  "Crear primera PQRS" del estado vacío de `mis-pqrs` al migrarlo. Usar
  esta prop en cualquier estado vacío que necesite una acción, no
  duplicar el patrón a mano.

  Sin migrar todavía dentro de `pqrs/`: `[id]/page.tsx` (detalle),
  `gestionar/[id]/page.tsx`, `configuracion/page.tsx`, `nueva/page.tsx`,
  `nuevo/page.tsx` — son páginas de detalle/formulario, no listados con
  filtros, quedan fuera del alcance de esta pasada (igual que
  `gestion-*/[id]/gestionar` en `solicitudes/` se documentan aparte en
  `rediseno-gestionar-comite-credito.md`).
- **`src/components/modals/ModalesGenericos.tsx`** — `ConfirmModal`,
  `SuccessModal`, `ErrorModal`, `LoadingModal`, `WarningModal`, `InfoModal`.
  Reemplazan `alert()`/`confirm()` nativos — ver
  [`GUIA_MODALES.md`](GUIA_MODALES.md) (desactualizada respecto a
  `ErrorModal`, ver nota en [`rediseno-gestionar-comite-credito.md`](rediseno-gestionar-comite-credito.md)).

Patrón de detalle/gestión (tarjeta `border-radius: 22px`, grid de
info/conceptos, historial en columna fija) documentado en
[`rediseno-gestionar-comite-credito.md`](rediseno-gestionar-comite-credito.md).

Política de carga: renderizar el shell de inmediato y mostrar el loading
solo en la sección que depende del fetch, no bloquear toda la página — ver
[`LOADING_UX_AUDIT.md`](LOADING_UX_AUDIT.md).

## Inconsistencias detectadas (al tokenizar, 2026-09-12)

- **`Header.tsx`** usaba `#0052cc` en 7 lugares del menú móvil en vez de
  `#0050c7` (el resto del proyecto). Ya unificado a `brand-500`.
- **`rechazadas-ejecutivo/page.tsx`** tiene un botón cuyo hover es
  `#0050c7` (mapeado a `brand-500`) donde el mismo tipo de botón en el
  resto del proyecto usa `#0047b3` (`brand-700`) — no se corrigió el
  comportamiento visual por si fue intencional. **Pendiente confirmar** si
  debería ser `brand-700` como los demás.
- **`src/app/inicio/page.module.css`** tiene su propio sistema de variables
  CSS local, con `--azul-corp: #0052cc` — un tercer azul de marca,
  independiente de `globals.css`. No se tocó (archivo fuera del barrido
  original). **Pendiente decidir** si se une al sistema de tokens
  compartido o se deja aparte a propósito.

## Pendiente / próximos pasos

- Migrar el resto de páginas que aún no usan `PageHeaderCard`/
  `EmptyStateCard` (ver lista en
  [`rediseno-listados-gestion.md`](rediseno-listados-gestion.md), sección
  "Pendiente").
- Decidir las dos inconsistencias de arriba.
- Si se agregan más colores de marca reutilizados en 2+ archivos, tokenizarlos
  aquí en vez de repetir el hex.
