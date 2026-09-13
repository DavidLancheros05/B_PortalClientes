# Rediseño visual del módulo `seguridad/`

## Contexto

`seguridad/` (Roles, Módulos, Usuarios, Usuario-Roles, Permisos por página,
Consecutivos x2) **no entró en ningún barrido de rediseño anterior** — ver
[`parte visual.md`](parte%20visual.md), sección "Estado de migración". Cada
página tiene su propio wrapper, su propio color de acento, y una mezcla
desigual de `alert()`/`confirm()` nativos vs los modales compartidos
(`ConfirmModal`/`SuccessModal`/`ErrorModal` de `ModalesGenericos.tsx`).

Catálogo del estado actual (una pasada de lectura de las 8 páginas +
sub-modales, 2026-09-13):

| Página | Wrapper | Color acento actual | Filtros | Alerts/confirm nativos | Ya usa modales compartidos | Crear/editar |
|---|---|---|---|---|---|---|
| `roles/page.tsx` | `from-slate-50 to-slate-100` | indigo-600 | no (solo expand/collapse) | no | sí (Confirm+Success) | modal (`rolModal.tsx`) |
| `modulos/page.tsx` | `from-slate-50 to-slate-100` | blue-600 | 1 select estado, a mano | sí, ~9 sitios | no | **inline siempre visible** + modal solo para editar |
| `usuarios/page.tsx` | `bg-gray-50` plano | ninguno (texto plano) | 3 campos a mano | sí, ~5 sitios | parcial (solo en sub-modales) | modal (`usuarioModal.tsx`) |
| `usuarios/UsuarioCentrosModal.tsx` | — | ninguno | — | 1 `confirm()` | parcial | — |
| `usuarios/crear-usuarios/page.tsx` | — | — | — | — | — | solo redirect, sin UI |
| `usuario-roles/page.tsx` | `from-gray-50 to-gray-100` | ninguno | no | no, pero **sin confirmación** al quitar rol (gap real) | no | click directo, sin modal |
| `permisos-por-pagina/page.tsx` | `bg-slate-50` plano | indigo-600 sólido | 1 buscador a mano | no (solo lectura) | no aplica | solo lectura |
| `consecutivos/consecutivos/page.tsx` | `bg-slate-50` plano | blue-600 | no | no | sí (Confirm+Success) | modal a mano (no `ModalesGenericos`) |
| `consecutivos/tipo-consecutivo/page.tsx` | `bg-slate-50` plano | purple-600 | no | no | sí (Confirm+Success) | modal a mano (no `ModalesGenericos`) |

Ningún archivo usa `PageHeaderCard`, `EmptyStateCard`, `TableContainer`,
`ResultsToolbar`, ni `FilterField`/`FilterActions`.

## Alcance y fasing

Se migra completo (8 páginas + 2 sub-modales de usuarios + `rolModal.tsx`),
en fases por complejidad — cada fase se implementa y se confirma antes de
pasar a la siguiente, no todo en un solo commit:

**Fase 1 — más simples, molde más limpio (twins casi idénticos): HECHA
(2026-09-13).** `consecutivos/consecutivos`, `consecutivos/tipo-consecutivo`.
Header → `PageHeaderCard` (eyebrow "Seguridad"), wrapper → tokens de marca
(`from-page-from to-page-to`), empty-state → `EmptyStateCard`, colores →
`brand-600`/`brand-700`. El error `ConfirmModal` reusado (patrón viejo, ver
nota de `ErrorModal` en `rediseno-gestionar-comite-credito.md`) se reemplazó
por `ErrorModal` real en ambas páginas — quedan con el patrón completo
`ConfirmModal` (confirmar antes de guardar/eliminar) → `SuccessModal` →
`ErrorModal`. Se mantuvo el modal de crear/editar como `fixed inset-0` a
mano (no había un componente de modal genérico de layout para reusar, solo
los de confirmación/resultado) pero restyleado a tokens. **No se agregó
`TableContainer`/`ResultsToolbar`**: estas dos páginas no tienen filtros ni
necesidad de exportar a Excel — agregarlos habría significado construir una
función de export que no existía, fuera del alcance de un rediseño visual;
se dejó la tabla en un `bg-white rounded-xl border` simple, igual que
`parametrizacion/estados` (que tampoco los usa por el mismo motivo). De
paso se corrigió un bug real en `consecutivos/page.tsx`: el select de
"Centro de Operación" tenía dos `&lt;option&gt;` con `value=""` (el
placeholder "Selecciona un centro" y la opción real "Global") con
`required` puesto — como ambas comparten valor vacío, el navegador nunca
consideraba el select "lleno" y bloqueaba el submit si el usuario quería
dejarlo en Global. Se quitó el placeholder duplicado y el `required`
(vacío = Global es un valor de negocio válido, no "sin seleccionar").

**Fase 2 — usuarios: HECHA (2026-09-13).** `usuarios/page.tsx` +
`usuarioModal.tsx` + `UsuarioCentrosModal.tsx`. Header → `PageHeaderCard`
(botón "Nuevo Usuario" movido al slot `actions`), filtros (Buscar/Rol/
Estado) → `FilterField`/`FilterActions` dentro del `children` del header,
empty-state → `EmptyStateCard`, colores → tokens de marca. Los ~5
`alert()`/`confirm()` de la página se separaron en estado +
`ConfirmModal`/`ErrorModal`: desactivar y eliminar ahora piden confirmación
vía `ConfirmModal` (antes `window.confirm`), activar sigue sin
confirmación (fiel al comportamiento original, que tampoco la tenía) y
todos los errores de estas acciones van a un `ErrorModal` compartido en vez
de `alert()`. **No se agregó `TableContainer`** por el mismo motivo que en
Consecutivos (sin export). `UsuarioCentrosModal.tsx` se reescribió con
estilos reales — tenía varios `&lt;button&gt;` sin `className` (aspecto
"sin terminar" detectado en el catálogo inicial) — y su `confirm()` nativo
al remover un centro pasó a `ConfirmModal`. `crear-usuarios/page.tsx` no se
tocó (sin UI propia, solo redirect).

**Fase 3 — roles: HECHA (2026-09-13).** `roles/page.tsx` + `rolModal.tsx`.
Header → `PageHeaderCard` (eyebrow "Seguridad"; acciones "Por página"/
Expandir/Colapsar/"Nuevo Rol" como botones `bg-white/14` y `bg-white`
sobre el gradiente), empty-state "sin roles" → `EmptyStateCard`, color
índigo → tokens de marca en spinner, icono de candado, badge de
"X módulos asignados", checkbox/resaltado de módulo seleccionado y botón
de guardar de `rolModal`. El árbol de módulos/permisos anidado dentro de
cada tarjeta de rol **se mantiene custom** (no encaja en tabla/listado
estándar); los colores por tipo de permiso (Ver=azul, Crear=verde,
Editar=ámbar, Eliminar=rojo, Aprobar=morado) se dejaron igual a propósito
— son semánticos por tipo de acción, no identidad de marca, igual criterio
que en el resto del proyecto (ej. estados de solicitud). El
`ConfirmModal` reusado como error pasó a `ErrorModal` real.

**Fase 4 — módulos (la más grande): HECHA (2026-09-13).** Header →
`PageHeaderCard`, el select de estado → `FilterField` (se mantuvo como
filtro en vivo sin botón Buscar — es un único select de 3 opciones sobre
un árbol ya cargado en memoria, sin el problema de debounce/reflow que
motivó el patrón Buscar/Limpiar en listados con texto). Los ~9
`alert()`/`confirm()` se separaron en `successMessage`/`errorMessage` +
`ConfirmModal` para inactivar/activar (antes `window.confirm` síncrono) +
`SuccessModal`/`ErrorModal` para resultados. **El formulario "Nuevo
Módulo" se movió a modal** (decisión confirmada): se eliminó la tarjeta
inline-siempre-visible y el botón "Nuevo Módulo" del header abre el mismo
modal que ya se usaba para editar — ese modal ya tenía el título condicional
"Crear Módulo"/"Editar Módulo", así que no hubo que duplicar el formulario,
solo redirigir el punto de entrada. De paso `isCreateFormValid` (que había
quedado sin uso al borrar el formulario inline) se conectó al botón de
submit del modal en vez de quedar como código muerto. La tabla-árbol con
drag-and-drop **se mantiene custom** (no es un listado con
`TableContainer`/`ResultsToolbar` estándar, es una herramienta de
reordenamiento) — solo se tokenizaron sus acentos azules (zona de drop,
indicador de posición, fila resaltada al arrastrar) a la paleta de marca.

**Fase 5 — usuario-roles: HECHA (2026-09-13).** Se fusionaron los 3
`return` distintos (loading/error/ok, cada uno con su propio bloque de
header copiado) en un solo `return` con un único `PageHeaderCard` (botón
"Actualizar" en `actions`) y el contenido condicional debajo. Empty-state
"sin usuarios" → `EmptyStateCard`. Colores azules genéricos → tokens de
marca. Se agregó `ConfirmModal` antes de quitar un rol asignado — antes no
había ninguna confirmación en esa acción (clic = borrado inmediato), hueco
de UX real detectado en el catálogo inicial, no solo un cambio visual.

**Fase 6 — permisos-por-pagina: HECHA (2026-09-13).** Header →
`PageHeaderCard`, usando su prop `onBack` (vuelve a `/seguridad/roles`) en
vez del link de texto "Volver a Roles" que tenía antes — coincide con el
viaje de ida que ya existe desde Roles ("Por página"). Buscador → 
`FilterField`/`FilterActions` (Buscar/Limpiar): antes filtraba en vivo con
cada tecla; se cambió al mismo patrón borrador/aplicado que el resto del
proyecto, aunque esta página es de solo lectura y el filtrado es barato
(client-side sobre datos ya cargados) — se priorizó consistencia de
interacción sobre mantener el live-filter, como ya se había decidido antes
para `mis-pedidos`. Resultado vacío → `EmptyStateCard`. Con esto, **las 8
páginas + 3 sub-modales de `seguridad/` quedaron migrados**.

## Bug encontrado al probar: drag-and-drop de Módulos no arrastraba

Reportado por el usuario probando `/seguridad/modulos` en Chrome después de
la migración (2026-09-13). Los `<td>` arrastrables de la tabla-árbol tenían
`draggable={true}` correcto, pero contenían texto plano (el nombre del
módulo) sin `user-select: none` — al hacer mousedown+arrastrar sobre el
texto, Chrome interpretaba el gesto como selección de texto en vez de
iniciar el drag nativo de HTML5, así que nunca disparaba `dragstart`
(el ícono de agarre sí aparecía al pasar el mouse, porque eso es solo un
`group-hover` de CSS, no depende del drag). **Bug preexistente**, no
introducido por esta migración — el código de drag-and-drop no se tocó al
tokenizar colores. Fix: se agregó la clase `select-none` a las 3 celdas
arrastrables (Módulo/Submódulo/Sub-submódulo) en
`seguridad/modulos/page.tsx`.

**Segunda vuelta**: con "Colapsar todo" activo, los módulos raíz con hijos
seguían sin poder arrastrarse — ese botón de flecha (expandir/colapsar)
vive dentro de la misma celda `<td draggable>`, y un mousedown que
aterriza justo sobre un `<button>` no dispara `dragstart` en el ancestro
(comportamiento estándar del navegador: los controles interactivos
capturan el gesto para su propio clic). Con todo colapsado, básicamente
todas las filas visibles son raíces-con-hijos, así que el botón queda
mucho más "en el camino" que con el árbol expandido. Fix: `draggable={false}`
explícito en ese botón, para que el navegador no dude a qué elemento
pertenece el gesto y lo deje subir al `<td>` ancestro.

**Pedido de UX de paso**: el árbol arrancaba siempre expandido al cargar
la página. Se cambió para que arranque colapsado (todos los nodos con
hijos) la primera vez que cargan los módulos — usando un `useRef` como
bandera de "ya se aplicó el colapso inicial" para que los refrescos
posteriores (después de crear/editar/reordenar) no pisen el
expandido/colapsado que el usuario ya armó a mano durante la sesión.

## Decisiones (confirmadas 2026-09-13)

1. **Color de headers: unificado a color de marca.** Todos los headers de
   `seguridad/` pasan a `bg-brand-gradient`/`brand-600`/`brand-700`, igual
   que el resto del proyecto ya migrado. Se descarta mantener índigo
   (Roles) o morado (Tipo de Consecutivo) — solo varía el ícono de lucide
   por página, no el color de fondo del header.
2. **Formulario de "Nuevo Módulo": se mueve a modal.** En Fase 4, el
   formulario inline-siempre-visible de `modulos/page.tsx` se reemplaza por
   un botón "Nuevo Módulo" que abre modal, igual que Roles/Usuarios/
   Consecutivos.

## Pendiente / fuera de esta pasada

- `usuarios/crear-usuarios/page.tsx`: candidato a eliminar una vez el flujo
  de apertura de modal esté confirmado (hoy es solo un redirect a
  `usuarios?new=true`), pero no se toca en esta migración.
