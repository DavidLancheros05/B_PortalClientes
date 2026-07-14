# Auditoría: renderizar primero, cargar datos después

## Contexto

Varias páginas bloquean el render completo con un `if (loading) return <LoadingModal ... />`
(o similar) hasta que termina de responder el backend — mientras tanto no se ve nada más
que un modal de carga, aunque el resto del layout (header, títulos, botones) no dependa
de esos datos. Eso se siente más lento de lo que realmente es.

**Patrón de arreglo**: quitar el `return` que bloquea toda la página, dejar que el shell
se renderice de inmediato, y mostrar un indicador de carga puntual solo dentro de las
secciones que sí dependen del fetch (listas, tablas, paneles), como en `formulario-editor`.

## Ya corregidas

- **`src/app/parametrizacion/formulario-editor/page.tsx`** — quitado el
  `if (loading) return <LoadingModal .../>` que bloqueaba toda la página. Ahora el header
  y los dos paneles (Secciones / Preguntas) se renderizan de inmediato; cada panel muestra
  "Cargando secciones..." / "Cargando preguntas..." mientras llega la data. También se
  corrigió el aviso de "esta versión no tiene preguntas" para que no aparezca falsamente
  mientras `loading` sigue en `true`.

- **`src/app/solicitudes/mis-documentos/page.tsx`** — el header y los botones ya
  renderizaban de inmediato (no era un bloqueo total), pero la carga se sentía lenta
  por una causa distinta: el backend (`GET /solicitudes/mis-documentos`) calculaba
  el representante legal en cada carga reconstruyendo el formulario renderizable
  completo (`FormularioRenderizableService`), el paso más caro de todo el endpoint,
  aunque ese dato solo se usa si el cliente llega a pulsar "Descargar plantilla".
  Se extrajo a un endpoint aparte (`GET /solicitudes/:id/representante-legal`) que
  el frontend solo pide bajo demanda, justo antes de generar una plantilla de tipo
  `TEXTO` (las de tipo `PDF_SOLICITUD` ni lo necesitan). De paso se cambió el
  placeholder de "Cargando tus documentos..." por un skeleton de filas en vez de
  una caja de texto plana.

- **`src/app/solicitudes/nueva/SolicitudFormContent.tsx`** (usada tanto por
  `/solicitudes/nueva` como por `/solicitudes/[id]/editar`) — el
  `if (loadingInitial || secciones.length === 0) return (...)` reemplazaba la
  página entera por una pantalla de "Cargando formulario..." sin encabezado
  ni botón "Atrás". Ahora el encabezado (título, versión, botón Atrás) se
  renderiza de inmediato y solo el cuerpo (sidebar de secciones + panel de
  preguntas) alterna entre el indicador de carga y el contenido real.

- **`src/app/solicitudes/[id]/detalle/page.tsx`** — el `if (loading) return
  <LoadingModal .../>` bloqueaba toda la página. Ahora el contenedor y el
  botón "Volver" se renderizan de inmediato; la tarjeta de encabezado
  muestra un skeleton mientras carga y el grid de secciones muestra tarjetas
  skeleton hasta que llega la respuesta del backend.

- **`src/app/dashboard/page.tsx`** — a diferencia de las anteriores, no depende de un
  fetch al backend (el `user` sale de `localStorage` en un `useEffect`), así que el
  `if (loading) return <LoadingModal .../>` bloqueaba el render por algo casi
  instantáneo. Ahora el título "Dashboard" se renderiza de inmediato; el bloque de
  bienvenida/rol y la tarjeta de accesos por rol muestran un skeleton (`animate-pulse`)
  hasta que `user` está disponible.

- **`src/app/parametrizacion/clientes/[id]/page.tsx`** — el `if (loading)`/`if (error)`
  reemplazaban toda la página (incluido el botón "Volver a clientes"). Ahora el botón
  "Volver" se renderiza siempre; la tarjeta de detalle alterna entre skeleton, mensaje
  de error o los datos del cliente, sin perder el resto del layout.

- **`src/app/parametrizacion/formularios/page.tsx`** — el `if (loading)` bloqueaba toda
  la página (header, filtros y estadísticas incluidos) mientras cargaba la lista. Ahora
  header, filtros de búsqueda y las tarjetas de Total/Activos/Inactivos se renderizan de
  inmediato; solo la sección "Formularios registrados" muestra tarjetas skeleton mientras
  `loading` es `true` (se reusa también al buscar/limpiar filtros o pulsar "Actualizar").

- **`src/app/parametrizacion/formularios/[formularioId]/versiones/page.tsx`** — el botón
  "Volver al editor" ahora se renderiza siempre; la tarjeta de encabezado (nombre del
  formulario, versión activa) y el timeline de versiones muestran skeleton mientras carga,
  y el mensaje "Formulario no encontrado" ya no reemplaza la página entera.

- **`src/app/parametrizacion/formulario-preguntas/[id]/opciones/components/OpcionesTable.tsx`**
  — la página contenedora (`opciones/page.tsx`) ya renderizaba el header y el formulario de
  nueva opción de inmediato; solo se cambió el texto plano "Cargando opciones..." por
  skeleton de filas de tabla, consistente con el resto.

- **`src/app/pqrs/[id]/page.tsx`** y **`src/app/pqrs/gestionar/[id]/page.tsx`** — mismo
  patrón: el botón "Volver" se renderiza siempre; el resto (detalle de la PQRS, tabs de
  Timeline/Comentarios, y en la variante de gestión el panel de "Cambiar Estado") alterna
  entre skeleton, pantalla de error o contenido según `loading`/`error`/`pqrs`.

- **Las 5 páginas de gestión de etapas del workflow** (`gestion-auxiliar-servicio-al-cliente`,
  `gestion-comite-credito-1`, `gestion-comite-credito-2`, `gestion-ejecutivo-negocios`,
  `gestion-oficial-de-cumplimiento`) comparten la misma estructura: header con botón
  "Volver" (algunas con banda de color) siempre visible, y el resto de la tarjeta (info de
  la solicitud, formulario de decisión, historial) mostrando skeleton mientras `loading`,
  mensaje de "No se encontró la solicitud" si `!solicitud` tras cargar, o el contenido real.
  De paso, en 3 de estas páginas (`comite-credito-1`, `comite-credito-2`,
  `gestion-oficial-de-cumplimiento`) se eliminó una variable `pasos` que ya estaba sin usar
  en el JSX (dead code preexistente) y que habría explotado en tiempo de ejecución al acceder
  a propiedades de `solicitud` mientras esta es `null` (antes protegido por el `if (!solicitud)
  return` que el nuevo patrón elimina).

## Pendientes por revisar

Ninguna por ahora — todas las páginas detectadas por el `grep` inicial de `if (loading)` en
`src/app` fueron revisadas y corregidas. Puede haber páginas con el mismo problema usando
otro nombre de variable (`cargando`, `isLoading`, etc.) que no quedaron capturadas por ese
patrón; si se detecta una nueva, agregarla aquí y aplicar el mismo enfoque.
