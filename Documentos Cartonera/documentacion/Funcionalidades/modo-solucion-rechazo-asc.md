# "Modo de Solución" al rechazar en Auxiliar Servicio Cliente

> Documenta los dos caminos posibles cuando el Auxiliar de Servicio al Cliente
> (ASC) rechaza una solicitud por problemas de documentos (fecha de emisión
> vencida, o documento que no corresponde al tipo requerido), y cómo eso
> conecta con el resto del sistema. Antes no existía ningún documento sobre
> esto — la relación entre `modo_solucion` y `corregir-formulario-asc` no
> estaba escrita en ningún lado.

## Contexto

El rol del ASC en esta etapa está acotado a **revisar**: verificar que la
fecha de emisión de cada documento cargado sea correcta y no esté vencida, y
que el archivo subido corresponda al tipo de documento pedido. El ASC no
puede generar ni corregir el contenido de un documento — no tiene forma de
"inventar" una fecha de emisión real ni de producir un RUT/certificado
válido. Esa corrección solo la puede hacer:

- **El cliente**, resubiendo el documento correcto desde su propio flujo, o
- **El propio ASC**, pero solo en el sentido de *cargar el archivo correcto
  en el sistema en nombre del cliente* — no de fabricar el contenido. Esto
  aplica cuando el ASC ya tiene el documento correcto en sus manos (se lo
  mandaron por otro medio, por ejemplo) y prefiere subirlo directamente en
  vez de hacer esperar al cliente.

Para el segundo caso ya existe una pantalla de staff, independiente de esta
pantalla de aprobar/rechazar: `F_PortalClientes/src/app/solicitudes/
corregir-formulario-asc/page.tsx` — un buscador de solicitudes que enlaza a
`/solicitudes/:id/editar?returnTo=/solicitudes/corregir-formulario-asc`
(`F_PortalClientes/src/app/solicitudes/[id]/editar/page.tsx`), que reutiliza
el mismo `SolicitudFormContent` del formulario de "nueva solicitud" del
cliente — con sus mismos campos de carga de archivo. El backend ya lo
autoriza: `SolicitudesDocumentosService.verificarAccesoSolicitud`
(`B_PortalClientes/src/solicitudes/solicitudes-documentos.service.ts`)
permite a cualquier rol de personal interno (no solo CLIENTE) tocar los
archivos de cualquier solicitud, con el comentario explícito "ASC corrigiendo
en nombre del cliente".

## Los dos caminos de "Modo de Solución"

En la pantalla `gestion-auxiliar-servicio-al-cliente/[id]/gestionar`, al
rechazar con al menos un documento marcado (columna "Solicitar cambio de
documento"), el ASC elige un `modo_solucion`:

| Valor | Quién actúa | `sol_estado_id` resultante | Qué pasa |
|---|---|---|---|
| `cliente_actualiza` | El cliente | `2` (PENDIENTE) | Se le envía un correo de rechazo (`notificarRechazoSolicitud`) explicando el motivo y los documentos con problema. El cliente debe volver a `/solicitudes/mis-documentos` y resubir. |
| `auxiliar_actualiza` | El propio ASC | `3` (REVISIÓN) | El ASC va a `corregir-formulario-asc` → `/solicitudes/:id/editar`, sube ahí el documento correcto en nombre del cliente. **No se le envía correo al cliente** — no hace falta, porque no tiene nada que hacer. |

En ambos casos `sol_etapa_actual_id` queda en ASC y `sol_resultado_etapa_id`
en RECHAZADO — lo único que cambia entre los dos modos es `sol_estado_id`, y
ese valor es la señal que usa el resto del sistema para decidir quién puede
tocar la solicitud (ver siguiente sección).

### Por qué el estado (no el modo_solucion crudo) es lo que importa

Nada del sistema lee `modo_solucion` fuera de `aprobarRechazarSolicitud`
mismo — el resto de las pantallas deciden todo a partir de la tripleta
`(sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id)`:

- **`puedeCorregir`** (`solicitudes.controller.ts`, endpoint de
  `mis-documentos`): `[1, 2].includes(sol_estado_id)`. Con
  `auxiliar_actualiza` (estado `3`) da `false` — el cliente queda bloqueado
  de tocar cualquier documento, ni marcado ni no.
- **`rechazadoPorAuxiliar`** (mismo endpoint): `estado===2 && etapa===3(ASC)
  && resultado===3(RECHAZADO)` — coincide exactamente con `cliente_actualiza`.
  Activa en `mis-documentos` el aviso naranja + el badge "Requiere cambio" +
  vuelve editable solo los documentos con `sd_requiere_cambio` o vencidos
  (`esDocumentoEditable` en `F_PortalClientes/src/app/solicitudes/
  mis-documentos/page.tsx`).
- **`SolicitudesContent.tsx`** (listado "Mis Solicitudes" del cliente): tiene
  el mismo caso `estado===2 && etapa===3 && resultado===3` hardcodeado para
  mostrar el botón "Corrija los documentos" → `router.push("/solicitudes/
  mis-documentos")`.
- **`corregir-formulario-asc/page.tsx`** (buscador de staff): filtra
  literalmente `estado_id: 3, etapa_id: 3, resultado_etapa_id: 3` — coincide
  exactamente con `auxiliar_actualiza`. Antes de este cambio el título decía
  "...por parte del cliente" (ver bug abajo).

## Observación que ve el cliente (`sol_observacion_cliente`)

`aprobarRechazarSolicitud` ahora escribe `sol_observacion_cliente`
explícitamente para los tres desenlaces (aprobado, `cliente_actualiza`,
`auxiliar_actualiza`), en vez de dejar que el frontend la infiera del
estado/etapa/resultado. Esto era un pedido explícito: la decisión de qué
mensaje corresponde vive en el backend, no en lógica duplicada del cliente.
El frontend (`SolicitudesContent.tsx`) igual conserva sus casos hardcodeados
como *respaldo* — están comentados en el código como tal — para solicitudes
antiguas o transiciones que todavía no escriben esta columna, no como fuente
de verdad para transiciones nuevas.

## Bugs corregidos (2026-07-21)

**1. Se enviaba correo de rechazo también en `auxiliar_actualiza`.**
`aprobarRechazarSolicitud` enviaba el correo de rechazo
(`notificarRechazoSolicitud`) siempre que `aprobado === false`, sin mirar
`modo_solucion` — elegir "Auxiliar Actualiza" no cambiaba nada en el
comportamiento real del sistema más que el valor guardado. Esto hacía que
ambos modos fueran indistinguibles en la práctica, y que el cliente recibiera
un correo de rechazo confuso incluso cuando el ASC ya iba a resolverlo él
mismo sin que el cliente tuviera que hacer nada.

**Fix**: la condición de envío de correo ahora es
`!aprobado && clienteEmail && modo_solucion !== 'auxiliar_actualiza'`.

**2. `sol_observacion_cliente` no se actualizaba al rechazar desde ASC.**
Ninguna rama de `aprobarRechazarSolicitud` tocaba esta columna — el cliente
veía la observación que hubiera quedado de la transición anterior (ej. "Tu
solicitud se encuentra en revisión." puesta por el Ejecutivo de Negocios),
sin ninguna mención al rechazo ni a qué debía hacer. El único lugar que
compensaba esto era un `if` hardcodeado en `SolicitudesContent.tsx` para el
caso exacto `cliente_actualiza`; `auxiliar_actualiza` no tenía ningún
mensaje específico.

**Fix**: la función ahora arma `observacionCliente` junto con `estadoId` y
la escribe en la misma query `UPDATE solicitudes` (parametrizada), para los
tres desenlaces posibles.

**3. Título/subtítulo invertidos en `corregir-formulario-asc`.**
Decía "Solicitudes Pendientes de Corrección por Cliente" / "...requieren
corrección por parte del cliente", pero la página filtra
`estado_id: 3, etapa_id: 3, resultado_etapa_id: 3` — exactamente las
solicitudes de `auxiliar_actualiza`, donde el cliente está bloqueado
(`puedeCorregir=false`) y es el propio ASC quien debe corregir. El texto
decía lo contrario de lo que la página realmente hace.

**Fix**: título → "Solicitudes Pendientes de Corrección por el Auxiliar";
subtítulo aclara que son las rechazadas con "Auxiliar Actualiza" y que el
cliente no puede tocarlas.

**4. El frontend nunca enviaba `modo_solucion` al backend.** Detectado en
vivo: al rechazar de verdad una solicitud eligiendo "Auxiliar Actualiza"
desde `gestion-auxiliar-servicio-al-cliente/[id]/gestionar`, el objeto que
`handleConfirmGuardarDecision` mandaba a `registrarAprobacion` no incluía la
propiedad `modo_solucion` — se había perdido en un refactor anterior de ese
mismo payload (al quitar `motivo_rechazo_id`). El wrapper
`F_PortalClientes/src/services/solicitudes.service.ts::registrarAprobacion`
tampoco declaraba `modo_solucion` en su tipo, así que ni siquiera daba error
de compilación. Resultado: el backend siempre caía en el `else` de
`aprobarRechazarSolicitud` (el branch de "modo_solucion no reconocido"),
dejando `sol_estado_id = 2` (PENDIENTE, el valor de `cliente_actualiza`) y la
observación genérica "Tu solicitud fue rechazada por el auxiliar de servicio
al cliente." — es decir, **elegir "Auxiliar Actualiza" en la UI no tenía
ningún efecto real**, ni en el estado ni en si el cliente podía tocar los
documentos. Esto afectó al menos a la solicitud 16 (`sol_id=2187`), corregida
a mano en BD tras aplicar el fix.

**Fix**: se agregó `modo_solucion: gestion.modo_solucion` al payload en
`gestionar/page.tsx`, y `modo_solucion?: string | null` al tipo de
`solicitudes.service.ts::registrarAprobacion` (antes solo existía en
`workflow-solicitudes.service.ts`, un nivel más abajo).

## Pendiente / no implementado todavía

- La pantalla de rechazo no redirige ni enlaza automáticamente a
  `corregir-formulario-asc` cuando se elige "Auxiliar Actualiza" — el ASC
  debe navegar ahí manualmente. Sería una mejora natural de UX, no
  implementada en este cambio.
- No hay ningún vínculo en BD entre la fila de
  `solicitud_workflow_historial` del rechazo y la corrección posterior que
  haga el ASC en `editar` — no hay forma de auditar "esta solicitud se
  rechazó con auxiliar_actualiza y efectivamente se corrigió el N de julio".
