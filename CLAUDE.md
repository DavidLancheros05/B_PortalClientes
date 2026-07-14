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

- **BACKEND**: NestJS + SQL Server (paquete `mssql`), hospedado en
  `SQL8020.site4now.net`. Config en `BACKEND/.env` (nunca commitear este
  archivo — ya está en `.gitignore`). `npm run start:dev` (nest watch mode),
  puerto en `.env` (`PORT`), prefijo global de rutas `/api` (ver
  `src/main.ts::setGlobalPrefix('api')`).
- **FRONTEND**: Next.js App Router. `npm run dev`, puerto 3000. Cliente axios
  en `src/services/core/api.ts` con JWT bearer desde
  `localStorage.getItem("token")`; el hook `useAuth` redirige a `/login` si
  falta token/usuario.
- **Quirk conocido**: `nest start --watch` a veces no recarga el proceso tras
  editar código — el caso más común es que revienta con
  `Error: listen EADDRINUSE: address already in use :::3001` porque su propio
  intento de matar el proceso viejo falla. Cuando pase, no ir por rondas
  cortas de "esperar y revisar" — hacerlo de una sola vez:
  ```bash
  PID=$(netstat -ano | grep LISTENING | grep ':3001' | awk '{print $5}' | head -1)
  [ -n "$PID" ] && taskkill //F //PID $PID
  cd BACKEND && npm run start:dev   # run_in_background: true
  ```
  Nest tarda ~60-90s en recompilar y levantar — un solo `ScheduleWakeup` de
  90s suele bastar antes de volver a probar. Detalle completo en
  [`documentacion/mejoras/COSTOS_DE_SESION.md`](documentacion/mejoras/COSTOS_DE_SESION.md).

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
- **`documentacion/FLUJO_ETAPAS.md`**: tabla de referencia completa de la
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
  `documentacion/FLUJO_ETAPAS.md`.

## Arquitectura frontend

- Next.js App Router (`src/app/**/page.tsx`). El gate de autenticación no
  vive en un `middleware.ts` sino en **`FRONTEND/src/proxy.ts`**
  (`matcher`: `/dashboard`, `/solicitudes`, `/pedidos`, `/aprobaciones`,
  `/condiciones-financieras`, `/admin`, `/perfil`) — verifica un JWT en la
  **cookie** `token` firmado con el secreto hardcodeado `mi_super_secreto`
  (via `jose`), que es **distinto** del `JWT_SECRET` del backend usado por
  `mint-jwt.mjs`/`JwtAuthGuard`. Si falta o es inválida esa cookie, redirige
  a `/login` con 307 **antes de que cargue cualquier JS de la página**
  (confirmable con `curl -I` a la ruta). Para probar rutas protegidas con
  Playwright hacen falta **dos tokens distintos**: la cookie `token`
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
centralizada en **`documentacion/`** (carpeta suelta en la raíz de
`PROYECTO/`, fuera de ambos repos git — ni `BACKEND` ni `FRONTEND` la
versionan). Antes vivía repartida en la raíz de cada repo; se movió ahí
el 2026-07-13 a pedido del usuario. Incluye, entre otros:
`ANALISIS_BACKEND.md`, `ANALISIS_FRONTEND.md`, `ARCHITECTURE.md`,
`TIPOS_API_AUDITORIA.md` (generados en mayo 2026: pueden servir de punto de
partida rápido, pero **no son necesariamente exactos hoy** — el esquema y
varios flujos (rename a prefijo `sa_`, documentos diferidos, tipo de
plantilla) cambiaron después), `FLUJO_ETAPAS.md`, `mejoras/COSTOS_DE_SESION.md`,
`mejoras/LOADING_UX_AUDIT.md`, y análisis puntuales por tema (ampliación de
cupo, almacenamiento de archivos, etc.). Antes de citar cualquiera de estos
como verdad actual, contrastar con el código o con
`git log`/`documentacion/FLUJO_ETAPAS.md`. Si se crea documentación nueva de
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
