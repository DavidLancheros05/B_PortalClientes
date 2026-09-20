# Cartonera — Portal de Clientes

Portal donde un cliente diligencia una "solicitud de vinculación comercial", sube
documentos, y esta pasa por un flujo de aprobación interno (Ejecutivo de
Negocios → Auxiliar Servicio Cliente → Oficial de Cumplimiento → Comité de
Crédito 1 → Comité de Crédito 2) hasta quedar aprobada o rechazada.

## Estructura del repo

`BACKEND/` y `FRONTEND/` son **dos repos git independientes** (no hay `.git` en
la raíz `PROYECTO/`). Cada uno tiene su propio remoto en GitHub, usuario
`DavidLancheros05`:

- `BACKEND` → remoto `origin` = `B_PortalClientes`
- `FRONTEND` → remoto `origin` = `F_PortalClientes`

Antes de commitear/pushear, siempre confirmar en cuál de los dos repos se está
parado (`git -C BACKEND status`, `git -C FRONTEND status`), nunca asumir.

## Stack y cómo correr en local

- **BACKEND**: NestJS + SQL Server (paquete `mssql`). El host/credenciales
  reales viven **solo** en `BACKEND/.env` (nunca commitear este archivo —
  ya está en `.gitignore`; no hardcodear el host en ningún script ni
  documento, siempre leerlo de ahí). `npm run start:dev` (nest watch mode),
  puerto en `.env` (`PORT`), prefijo global de rutas `/api` (ver
  `src/main.ts::setGlobalPrefix('api')`).
- **FRONTEND**: Next.js App Router. `npm run dev`, puerto 3000. Cliente axios
  en `src/services/core/api.ts` con JWT bearer desde
  `localStorage.getItem("token")`; el hook `useAuth` redirige a `/login` si
  falta token/usuario.
- **Quirk conocido**: `nest start --watch` a veces no recarga el proceso tras
  editar código — el caso más común es que revienta con
  `Error: listen EADDRINUSE: address already in use :::<PORT>` (el puerto real
  sale de `BACKEND/.env::PORT` — **no asumir 3001**: hay al menos un entorno
  donde es `3003`, y el puerto 3001 puede estar ocupado por una app
  completamente ajena a este repo; confirmar el valor de `PORT` en `.env`
  antes de matar cualquier proceso por número de puerto) porque su propio
  intento de matar el proceso viejo falla. Cuando pase, no ir por rondas
  cortas de "esperar y revisar" — hacerlo de una sola vez:
  ```bash
  PORT=$(grep '^PORT=' BACKEND/.env | cut -d= -f2)
  PID=$(netstat -ano | grep LISTENING | grep ":$PORT" | awk '{print $5}' | head -1)
  [ -n "$PID" ] && taskkill //F //PID $PID
  cd BACKEND && npm run start:dev   # run_in_background: true
  ```
  Nest tarda ~60-90s en recompilar y levantar — un solo `ScheduleWakeup` de
  90s suele bastar antes de volver a probar. Detalle completo en
  [`documentacion/mejoras/COSTOS_DE_SESION.md`](Documentos%20Cartonera/documentacion/mejoras/COSTOS_DE_SESION.md).

## Base de datos — convenciones y documentación

- Prefijos de columnas por tabla: `sol_` (solicitudes), `sa_`
  (Solicitud_archivo), `fp_` (Formulario_pregunta), `fs_`
  (Formulario_secciones), `fr_` (Formulario_respuesta), `tdo_`
  (Tipos_documentos), `wet_`/`wee_` (workflow_etapas /
  workflow_estado_etapa), `cli_` (Clientes), `usr_` (usuarios).
- **`FRONTEND/DATABASE.md`** (~12k líneas) es un dump completo y
  auto-generado del esquema (123 tablas, columnas, FKs, conteo de filas).
  Se regenera con `npm run db:doc` desde `FRONTEND/` (requiere
  `FRONTEND/.env.local` con `DB_SERVER`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/
  `DB_NAME` — ojo, son nombres de variable distintos a los de
  `BACKEND/.env`, que usa `DB_HOST` en vez de `DB_SERVER`). **Está
  desactualizado** (última generación: mayo 2026) — no refleja columnas
  agregadas después, como `tdo_tipo_plantilla`, `fs_oculta_en_formulario`,
  `fp_oculto_en_formulario`, ni el merge de `Solicitud_documento` dentro de
  `Solicitud_archivo`. Antes de confiar en él para una tabla que cambió
  recientemente, regenerarlo o verificar en vivo.
- **`BACKEND/migrations/`** tiene el historial real de cambios de esquema en
  orden cronológico (nombre = fecha) — es la fuente más confiable de qué
  columnas existen hoy si `DATABASE.md` está desactualizado.
- **`documentacion/Portal Clientes/Solicitudes/FLUJO_ETAPAS.md`**: tabla de referencia completa de la
  máquina de estados del workflow (`sol_estado_id` × `sol_etapa_actual_id` ×
  `sol_resultado_etapa_id` → quién debe actuar y qué endpoint usa). Consultar
  esto en vez de reconstruir la lógica de estados desde cero.

## Arquitectura backend

- Mezcla de dos patrones de acceso a datos:
  - **SQL crudo parametrizado** (`dataSource.query()` / `queryRunner.query()`)
    en casi todo `src/solicitudes/*` (múltiples servicios:
    `solicitudes.service.ts`, `solicitudes-workflow.service.ts`,
    `solicitudes-documentos.service.ts`, `solicitudes-listados.service.ts`,
    etc.).
  - **TypeORM** (`Repository<Entity>`) en los módulos de parametrización
    más simples: `formulario-preguntas`, `formulario-secciones`,
    `tipos-documentos`.
- **Tres sistemas de generación de PDF distintos, no intercambiables**:
  1. PDF completo de la solicitud (todos los datos del formulario) — `pdf-lib`,
     en `solicitudes.service.ts::generarPdfSolicitud`, expuesto en
     `GET /solicitudes/:id/pdf`.
  2. Carta de Vinculación (condiciones pactadas al aprobar) — `pdfkit`, en
     `solicitudes-workflow.service.ts` (`generarPDFCarta`,
     `enviarCartaVinculacionPorCorreo`), tabla
     `param_carta_pdf_vinculacion`.
  3. Plantillas de documento individuales con placeholders (ej. "Manifestación
     suscrita") — se generan **en el frontend** con `html2pdf.js`
     (`FRONTEND/src/lib/carta-pdf.util.ts`), sustituyendo
     `{{cliente_nombre}}`, `{{cliente_nit}}`, `{{numero_solicitud}}`,
     `{{representante_legal_nombre}}`, `{{representante_legal_cedula}}`.
     `Tipos_documentos.tdo_tipo_plantilla` decide cuál mecanismo usar por
     documento: `'TEXTO'` (opción 3) o `'PDF_SOLICITUD'` (reusa la opción 1).
- **"Documento diferido"**: una `Formulario_pregunta` oculta durante el
  diligenciamiento (`fp_oculto_en_formulario`, o su sección con
  `fs_oculta_en_formulario`) y vinculada a un `Tipos_documentos` con
  `tdo_tiene_plantilla=true`. Estos documentos no bloquean el llenado del
  formulario, pero si faltan al enviar, la solicitud se queda en
  `sol_estado_id=2, sol_etapa_actual_id=1(CLI), sol_resultado_etapa_id=5
  (PEND_DOCS)` en vez de pasar a Ejecutivo de Negocios — ver
  `documentacion/Portal Clientes/Solicitudes/FLUJO_ETAPAS.md`.

## Arquitectura frontend

- Next.js App Router (`src/app/**/page.tsx`). El gate de autenticación no
  vive en un `middleware.ts` sino en **`FRONTEND/src/proxy.ts`**
  (`matcher`: `/dashboard`, `/solicitudes`, `/pedidos`, `/aprobaciones`,
  `/condiciones-financieras`, `/admin`, `/perfil`) — verifica un JWT en la
  **cookie** `pc_token` (renombrada desde `token` el 2026-07-22 porque las
  cookies de `localhost` no distinguen puerto y otra app local con cookie
  `token` la sobrescribía, cerrando la sesión) firmado con el secreto
  hardcodeado `mi_super_secreto`
  (via `jose`), que es **distinto** del `JWT_SECRET` del backend usado por
  `mint-jwt.mjs`/`JwtAuthGuard`. Si falta o es inválida esa cookie, redirige
  a `/login` con 307 **antes de que cargue cualquier JS de la página**
  (confirmable con `curl -I` a la ruta). Para probar rutas protegidas con
  Playwright hacen falta **dos tokens distintos**: la cookie `pc_token`
  (firmada con `mi_super_secreto`, solo necesita pasar `jwtVerify`, no
  importa el payload) para pasar `proxy.ts`, y el `localStorage.token`
  (minteado con `mint-jwt.mjs`, valen igual que en curl) para que las
  llamadas axios al backend real (`NEXT_PUBLIC_API_URL`) no den 401.
- Servicios en `src/services/*.service.ts` (uno por dominio), todos sobre el
  cliente axios compartido `src/services/core/api.ts`.
- Preferencia de UX establecida en este proyecto: **las páginas deben
  renderizar de inmediato**, no bloquear tras un spinner de pantalla
  completa mientras cargan datos del backend — usar estados de carga
  parciales/inline por sección. Ver `documentacion/mejoras/LOADING_UX_AUDIT.md`
  para el estado de esta migración página por página.

## Documentación existente — vigencia

Toda la documentación de análisis/diagnóstico que no sea código vive
centralizada en **`documentacion/`** (ruta real:
`BACKEND/Documentos Cartonera/documentacion/`). **Corregido 2026-09-13**: a
diferencia de lo que decía esta sección antes, **sí está versionada — es
parte del repo `BACKEND`** (confirmado con `git rev-parse --show-toplevel`
desde dentro de la carpeta: apunta a la raíz de `BACKEND`, mismo remoto de
GitHub). `FRONTEND` no la toca. Antes vivía repartida en la raíz de cada
repo; se movió ahí el 2026-07-13 a pedido del usuario. Incluye, entre
otros:
`ANALISIS_BACKEND.md`, `ANALISIS_FRONTEND.md`, `ARCHITECTURE.md`,
`TIPOS_API_AUDITORIA.md` (generados en mayo 2026: pueden servir de punto de
partida rápido, pero **no son necesariamente exactos hoy** — el esquema y
varios flujos (rename a prefijo `sa_`, documentos diferidos, tipo de
plantilla) cambiaron después), `Portal Clientes/Solicitudes/FLUJO_ETAPAS.md`,
`mejoras/COSTOS_DE_SESION.md`,
`mejoras/LOADING_UX_AUDIT.md`, y análisis puntuales por tema (ampliación de
cupo, almacenamiento de archivos, etc.). Antes de citar cualquiera de estos
como verdad actual, contrastar con el código o con
`git log`/`documentacion/Portal Clientes/Solicitudes/FLUJO_ETAPAS.md`. Si se crea documentación nueva de
este tipo, va en `documentacion/`, no en la raíz de `BACKEND`/`FRONTEND`.

Excepción: **`FRONTEND/DATABASE.md`** se queda en `FRONTEND/` porque
`npm run db:doc` (`FRONTEND/scripts/generate-db-doc.ts`) escribe ahí
hardcodeado — moverlo requeriría cambiar esa ruta en el script.

## Gotchas ya encontrados (para no repetirlos)

- `wee_codigo` en `workflow_estado_etapa` es `VARCHAR(10)` — códigos nuevos
  deben ser cortos (ej. `PEND_DOCS`, no `PENDIENTE_DOCUMENTOS`).
- Cualquier query que traiga `Solicitud_archivo` debe alias-ear
  `sa.sa_fp_id AS fp_id` si el código consumidor espera `fp_id` — ya hubo una
  regresión real por esto (rompía "Reemplazar"/"Descargar plantilla" y el
  reconocimiento de archivos ya subidos en el formulario de nueva
  solicitud).
- Nunca dejar un archivo temporal de verificación (scripts tipo
  `tmp-*.js` en `BACKEND/`) con la contraseña de la BD en texto plano
  camino a un commit — revisar `git status`/contenido antes de
  `git add -A`.
- Un ancestro con `backdrop-blur`/`filter` crea containing block para
  descendientes `position: fixed` (spec CSS) — los modales que deben cubrir
  todo el viewport van con `createPortal(..., document.body)`, no anidados
  dentro de un contenedor con blur.
- El frontend llega al backend por **dos caminos independientes**: el
  cliente axios (`src/services/core/api.ts`, usa `NEXT_PUBLIC_API_URL` como
  URL absoluta) y el rewrite de Next.js para URLs relativas `/api/*`
  (`FRONTEND/next.config.ts`, usa `BACKEND_URL`, resuelto en **build time**).
  Si `BACKEND_URL` falta o queda desactualizado en Vercel, el rewrite cae al
  default `http://127.0.0.1:3001` (inalcanzable en la nube) y **cualquier**
  ruta `/api/*` pedida por URL relativa da 404 "Cannot GET" — mientras las
  llamadas por axios (la mayoría de la app) siguen funcionando normal, porque
  usan la URL absoluta. Esta asimetría (todo funciona excepto lo que usa URL
  relativa, ej. los links de `getArchivoPreviewUrl` para ver/descargar
  documentos) es la pista de que es esto y no un bug de un endpoint puntual.
  Cambiar la env var en Vercel no alcanza: hay que forzar un redeploy sin
  build cache para que el rewrite la vuelva a leer. URL real de Render:
  `https://b-portalclientes-1.onrender.com`.

- **El menú del portal es 100% dinámico desde BD, no deriva de las rutas del
  código**: agregar un `page.tsx` nuevo (front) + módulo NestJS nuevo (back)
  **no lo hace aparecer en el menú de ningún rol**. El árbol de navegación
  sale de `pc_modulos` (`mod_nombre`, `mod_ruta`, `mod_padre_id`,
  `mod_posicion`, `mod_estado`) + `pc_rol_modulo` (`rm_rol_id`, `rm_mod_id`,
  `rm_ver`/`rm_crear`/`rm_editar`/`rm_eliminar`/`rm_aprobar`, `rm_activo`),
  vía `ModulosService.findByRol` (`src/modulos/modulos.service.ts`) y
  consumido en `FRONTEND/src/components/layout/Header.tsx`
  (`resolveModuloRoute`). `findByRol` además filtra: si un módulo no tiene
  fila en `pc_rol_modulo` para ese rol con al menos un permiso en `true`
  (`ver`/`crear`/`editar`/`eliminar`/`aprobar`), **no aparece**, aunque
  `mod_estado = 1`. Por cada página nueva de este tipo hace falta una
  migración en `migrations/` que inserte el módulo (y su padre si es
  jerárquico) en `pc_modulos` **y** una fila en `pc_rol_modulo` por cada rol
  que deba verlo — ver `20260716_actualizar_modulos_pqrs.sql` y
  `20260721_crear_modulos_consultas.sql` como plantilla (patrón idempotente
  `IF NOT EXISTS ... ELSE UPDATE`). Además, si la ruta nueva debe quedar
  detrás del login, hay que sumarla también al `matcher` de
  `FRONTEND/src/proxy.ts` — son dos mecanismos independientes (menú visible
  vs. acceso protegido) y falta cualquiera de los dos rompe la página por
  una razón distinta.

- **Columnas SQL Server `date` (sin hora/zona) exigen aritmética en UTC, no en hora local del proceso.** `mssql`/tedious serializa/deserializa `date` como medianoche UTC. `common/utils/business-days.util.ts` usaba `getDate()`/`setDate()`/`getDay()` (hora local) — inofensivo mientras el proceso Node corra en UTC (típico en Render/Vercel), pero al ejecutar el mismo cálculo desde una máquina en otra zona horaria (ej. un dev en `America/Bogota`, UTC-5) para reconstruir/recalcular fechas ya guardadas, la lectura de una columna `date` como `2026-07-20T00:00:00.000Z` se interpreta como `2026-07-19` 19:00 local — un día completo de corrimiento. Se descubrió porque un script de recálculo retroactivo escribió fechas mal la primera vez (detectado comparando el resultado contra un cálculo manual). Fix: todas las funciones de `business-days.util.ts` ahora usan `getUTC*`/`setUTC*` exclusivamente. Cualquier script nuevo que lea/escriba una columna `date` y haga aritmética de fechas debe hacer lo mismo (o forzar `TZ=UTC` en el proceso).
- **Días no hábiles de la semana ahora son parametrizables** (antes hardcodeado a sábado/domingo en `isBusinessDay`) vía tabla `param_dias_no_habiles_semana` (`dsh_dia_semana` 0=domingo..6=sábado, `dsh_co_id` NULL=todas las compañías, mismo criterio que `Festivos.fes_co_id`) — sin pantalla de administración propia, igual que `Festivos` (se edita directo en BD). Callers: `solicitudes.service.ts` (creación) y `historial-workflow.service.ts` (transición real), ambos con fallback a sábado/domingo si la tabla no existe o está vacía.
- **Pendiente de investigar (2026-08-02), NO arreglado todavía**: las columnas
  `datetime` (`sol_created_at`, `sol_updated_at`, `swh_fecha`, etc. — distinto
  de las columnas `date` del gotcha de arriba) parecen guardar la hora local
  de Colombia pero viajan etiquetadas como UTC (`Z`) en el JSON que devuelve
  la API. Verificado en vivo: una solicitud creada a las 6:31 p.m. hora real
  quedó con `sol_created_at = "...T18:31:53.800Z"` — los dígitos `18:31:53`
  son ya la hora local correcta, pero el sufijo `Z` hace que cualquier
  conversión "correcta" a UTC (ej. `new Date(valor).toLocaleString()` en el
  navegador, o restar el offset a mano) la corra 5 horas para atrás. Posible
  causa: `new Date()` en el proceso Node vs `GETDATE()` en SQL Server (host
  compartido, ver `DB_HOST` en `BACKEND/.env`) podrían no estar usando el
  mismo criterio de zona horaria al escribir, y el driver `mssql`/tedious etiqueta
  todo como UTC al leer sin importar cómo se escribió. Impacto potencial:
  cualquier fecha/hora mostrada en el frontend que haga esa conversión
  "correcta" (no solo mostrar el string crudo) saldría 5 horas adelantada o
  atrasada según el sentido de la conversión. No investigado a fondo ni
  arreglado — el usuario pidió dejarlo así por ahora.

- **El puerto del frontend debe coincidir exactamente con `CORS_ORIGINS` del
  backend, o cualquier request falla como si fuera un 500.** `FRONTEND` no
  tenía puerto fijo (`"dev": "next dev"` en `package.json` cae a `3000` por
  defecto), pero `BACKEND/.env::CORS_ORIGINS` está fijado a
  `http://localhost:4002`. Si el frontend arranca en un puerto distinto de
  `4002`, el navegador manda un `Origin` que el backend rechaza en el
  callback de CORS (`main.ts`), y eso se ve en el navegador como un `500` en
  cualquier endpoint (ej. `/auth/login`) — no como un error de CORS
  explícito. Fix aplicado: `PORT=4002` en `FRONTEND/.env.local` (Next.js lee
  `PORT` del entorno si no se pasa `-p`). Si se cambia el puerto de un lado,
  hay que cambiar el otro (`CORS_ORIGINS` en `BACKEND/.env` o `PORT` en
  `FRONTEND/.env.local`) a la vez.
- **Turbopack (Next 16) puede servir CSS cacheado y desactualizado incluso
  después de reiniciar `npm run dev`.** Al agregar tokens nuevos dentro del
  bloque `@theme` de `globals.css` (Tailwind v4), el navegador siguió
  recibiendo un chunk `_next/static/chunks/src_app_globals_*.css` sin los
  tokens nuevos aunque el proceso ya se había reiniciado — confirmado
  comparando el CSS servido (`curl` al chunk) contra el archivo en disco.
  Fix: borrar la carpeta `.next` (`rm -rf .next` / `Remove-Item -Recurse
  -Force .next`) antes de volver a correr `npm run dev`. Reiniciar el
  proceso solo, sin borrar `.next`, no fue suficiente.
- **`ModulosService.findByRol` (`BACKEND/src/modulos/modulos.service.ts`)
  hacía `leftJoin('m.roles', ...)` sobre una relación ORM que nunca existió**
  (`ModuloEntity` solo tiene `padre`/`subModulos`; `RolModuloEntity` no
  tiene relación hacia `ModuloEntity`, solo columnas `rm_mod_id`/`rm_rol_id`
  crudas) — el endpoint `GET /seguridad/modulos/por-rol` daba 500 para
  **cualquier** rol. No afectaba el login (`PermissionsService
  .getModulesByRole`/`getModulesByUsuario` usan SQL crudo aparte y sí
  funcionan), pero si algo más en el frontend llega a consumir ese
  endpoint quedaría roto. Fix: `leftJoin('pc_rol_modulo', 'rm', 'rm.rm_mod_id
  = m.mod_id AND rm.rm_rol_id = :rolId', { rolId })` — unir por nombre de
  tabla en vez de por relación inexistente.
- **Un módulo padre con hijos (ej. "Clientes") nunca es clickeable por sí
  mismo en el menú, solo se despliega con la flechita** — `Header.tsx` es
  así por diseño (confirmado con el usuario 2026-09-13, no es un bug): si
  un nodo tiene subModulos con permiso, solo renderiza el botón toggle
  (`ChevronDown`), nunca un `<Link>` a su propio `mod_ruta`. Si un módulo
  padre necesita ser "visitable", la solución correcta es agregarle un
  **hijo propio** que apunte a esa misma ruta (como ya existe el patrón
  "Clientes" > "Listado de clientes" + "Acceso a Clientes"), no convertir
  el padre en link. **Gotcha real encontrado**: el módulo hijo
  `mod_id=93` "Listado de clientes" llevaba meses con la ruta mal escrita
  (`/parametrizacion/clientes/listado-de-clientes`, que nunca existió
  como página — el listado real vive en `/parametrizacion/clientes`, la
  misma ruta del módulo padre `mod_id=92`) y sin ningún `rm_ver=1` en
  `pc_rol_modulo` para ningún rol, así que nunca apareció en el menú de
  nadie. Fix en `migrations/20260913_corregir_ruta_modulo_listado_clientes.sql`
  (corrige `mod_ruta` + habilita `rm_ver=1` para ADMIN, mismo alcance que
  el módulo padre). **Si un módulo "no aparece en el menú" y los permisos
  en `pc_rol_modulo` se ven bien, revisar también que `mod_ruta` sea una
  página que de verdad exista** — un módulo mal configurado así no da
  ningún error visible, simplemente el link nunca aparece o apunta a un
  404 silencioso. **Causa raíz real** (no un typo humano en un campo
  libre, como se pensó al principio — esa pantalla, `seguridad/modulos/
  crear/page.tsx`, resultó ser código huérfano sin ningún link hacia ella
  en toda la app, y ya se borró): la pantalla que sí se usa
  (`seguridad/modulos/page.tsx`) **generaba la ruta sola** a partir del
  nombre del módulo + la ruta del padre (`generateRoute()`/
  `slugifySegment()`, ya eliminados), sin dejar escribirla a mano. Al crear
  "Listado de clientes" como hijo de "Clientes", el sistema generó
  `.../clientes/listado-de-clientes` porque así lo dicta la fórmula
  (nombre-hijo pegado a ruta-padre) — pero esa página nunca se construyó
  aparte, el listado vive directo en la ruta del padre. La auto-generación
  no tenía forma de detectar eso.
  **Fix definitivo (2026-09-13, a pedido explícito del usuario tras
  discutir el diseño)**: se reemplazó la auto-generación por un `<select>`
  que **solo deja elegir entre páginas que ya existen** — ya no se puede
  crear un módulo apuntando a una ruta inventada, ni por fórmula ni a
  mano. `FRONTEND/scripts/generate-app-routes.ts` (`npm run
  routes:generate`) escanea `src/app` y escribe todas las rutas reales a
  `FRONTEND/src/data/app-routes.json`; `seguridad/modulos/page.tsx` filtra
  esa lista según el módulo padre elegido (solo rutas iguales o anidadas
  bajo la ruta del padre; todas las rutas si es un módulo raíz) y la
  ofrece como `<select>` tanto al crear como al editar. **Orden de trabajo
  correcto**: construir la página primero, correr `npm run
  routes:generate`, y recién ahí crear/editar el módulo de menú — si el
  campo de ruta se genera vacío o falta la página que buscas, casi
  siempre es porque `app-routes.json` está desactualizado.
- **`leftJoinAndSelect` de TypeORM + columnas `nvarchar(MAX)` = timeout de
  15s (500 "Internal server error"), aunque la tabla tenga pocas filas.**
  Reproducido contra la instancia de SQL Server que apuntaba `BACKEND/.env`
  en el momento (`DB_HOST=localhost`, un `sqlservr.exe` corriendo en esta
  misma máquina — **no** confirmado todavía si también pasa contra el host
  remoto compartido al que apunta la config comentada del mismo `.env` y
  la que describe la sección "Stack y cómo correr en local" de este
  archivo). `FormularioPreguntasService.findAll`
  (`GET /parametrizacion/formulario-preguntas`, usado por "Nueva solicitud"
  para cargar el formulario) hacía `createQueryBuilder('fp')
  .leftJoinAndSelect('fp.opciones', ...).leftJoinAndSelect('fp.seccion',
  ...)`. `Formulario_pregunta` tiene 4 columnas `nvarchar(MAX)`
  (`fp_descripcion`, `fp_tabla_columnas`, `fp_tabla_limite_reglas`,
  `fp_catalogo_filtro_reglas`); el `JOIN` con `opciones` multiplica filas.
  Confirmado con SQL crudo (`db-query.mjs`) que **una sola** columna MAX
  con el JOIN es rápida, pero **dos o más** MAX juntas con el JOIN
  (~140 preguntas × opciones) tardan >15s incluso en esa instancia local —
  no es un bug de TypeORM ni de este código en particular, es el motor de
  SQL Server manejando mal LOB data multiplicada por un JOIN.
  **Primer intento de fix, revertido**: `repository.find({ relations:
  {opciones: true, seccion: true}, relationLoadStrategy: 'query' })` sí
  soluciona el timeout (~200ms), pero tiene su propio bug — con esta
  combinación de relaciones (`OneToMany` con `@JoinColumn` explícito del
  lado `ManyToOne`), TypeORM 0.3.28 arma **dos** queries distintas para la
  misma relación `opciones` y la mapea mal: `opciones` vuelve **siempre
  vacío** para las 30 preguntas tipo SELECT/SELECT_TABLA/MULTISELECT del
  formulario real, sin ningún error — se detectó porque "Tipo de
  solicitud" dejó de mostrar sus opciones en el formulario de nueva
  solicitud. No usar `relationLoadStrategy: 'query'` en este proyecto
  hasta confirmar en una versión más nueva de TypeORM que ya no pasa.
  **Fix real, el que quedó**: nada de relaciones de TypeORM acá — 3
  queries manuales independientes (`find()` de `FormularioPregunta` sin
  relations, `find()` de `FormularioPreguntaOpcion` filtrado con
  `In(fpIds)`, `find()` de `Seccion` filtrado con `In(seccionIds)`) y
  mergeadas a mano en JS con `Map`. Sin JOIN no hay multiplicación de
  filas por las columnas MAX, y sin relación de TypeORM de por medio no
  hay riesgo de este bug de mapeo. ~90-250ms verificado en vivo, opciones
  confirmadas pobladas para las 30 preguntas SELECT-like reales (las 6 que
  quedan con `opciones: []` son correctas — son preguntas con
  `fp_catalogo_tabla` seteado, que sacan sus valores de un catálogo
  externo en el frontend, no de `Formulario_pregunta_opcion`). Si algún
  otro `leftJoinAndSelect`/`createQueryBuilder` empieza a dar 500 sin
  causa obvia en el código, sospechar primero de esta combinación
  (columnas `nvarchar(MAX)` + JOIN que multiplica filas) antes de asumir
  un bug de lógica — reproducir con un script standalone de TypeORM
  (`ts-node --transpile-only -r tsconfig-paths/register`, igual que
  `scripts/mint-jwt.mjs`/`db-query.mjs` pero con `DataSource` de TypeORM
  en vez de `mssql` crudo) para ver el stack trace real, porque el filtro
  `LogExceptionsFilter` solo lo imprime en la consola del proceso
  `start:dev`, no en la respuesta HTTP. Y **verificar siempre el contenido
  real de las relaciones**, no solo el status code/tiempo de respuesta —
  acá un fix que parecía perfecto (200 OK, rápido, cantidad de filas
  correcta) rompió en silencio todos los `opciones` de la respuesta.

## Patrones de verificación que ya funcionan en este proyecto

- **DB en vivo / migraciones**: usar `BACKEND/scripts/db-query.mjs` en vez de
  escribir un script Node nuevo cada vez (ya trae el parseo de `.env` y la
  conexión `mssql` resueltos):
  ```bash
  cd BACKEND
  node scripts/db-query.mjs "SELECT TOP 5 * FROM solicitudes"
  node scripts/db-query.mjs migrations/20260712_algo.sql
  ```
- **API en vivo**: usar `BACKEND/scripts/mint-jwt.mjs` para firmar un JWT de
  prueba (lee `JWT_SECRET` de `.env`) y pegarle a los endpoints con `curl`
  (recordar el prefijo `/api`):
  ```bash
  node scripts/mint-jwt.mjs ADMIN
  node scripts/mint-jwt.mjs CLIENTE 13603   # segundo argumento = cliente_id
  ```
- **Frontend visual**: Playwright (`chromium`, instalado localmente en el
  scratchpad) para capturas de pantalla. Con rol CLIENTE se ha visto un
  redirect a `/login` inconsistente en pruebas automatizadas aunque
  `localStorage` tenga token/usuario válidos — no confirmado si es un bug
  real o un artefacto del harness de prueba; con rol ADMIN funciona bien.
  Para flujos de CLIENTE es más barato verificar por API (JWT + curl) que
  por captura, salvo que el pedido sea explícitamente visual/CSS.

## Costos de sesión ya detectados

[`mejoras/COSTOS_DE_SESION.md`](mejoras/COSTOS_DE_SESION.md) — bitácora de
qué consumió tokens/tiempo de forma evitable en sesiones anteriores (y cómo
se resolvió). Revisar y ampliar cuando se note un patrón repetido de gasto
innecesario.
