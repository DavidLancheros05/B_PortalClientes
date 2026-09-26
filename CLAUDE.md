# Backend_portal (B_PortalClientes)

NestJS + SQL Server (paquete `mssql` / TypeORM), deploy en Render
(`https://b-portalclientes-1.onrender.com`). Contexto general del proyecto
(repos, puertos, sesión, cómo verificar) en `C:\DAVID\CN\CLAUDE.md`.

## Correr en local

- `npm run start:dev` (nest watch). Puerto en `.env` (`PORT`, hoy 4003), prefijo
  global `/api` (`src/main.ts`). Host/credenciales de BD **solo** en `.env`
  (variables `DB_*_DEV`); nunca hardcodearlos en scripts ni docs, ni commitear
  `.env`.
- `CORS_ORIGINS` debe incluir el origen exacto del frontend
  (`http://localhost:4002`); si no, el navegador ve un 500 en cualquier
  endpoint, no un error de CORS explícito.
- **Quirk**: `nest start --watch` a veces revienta con
  `EADDRINUSE :::<PORT>` al recargar. No ir por rondas de "esperar y revisar",
  hacerlo de una vez (**nunca** matar por puerto quemado, 3000/3001 son de otra
  app):
  ```bash
  PORT=$(grep '^PORT=' Backend_portal/.env | cut -d= -f2)
  PID=$(netstat -ano | grep LISTENING | grep ":$PORT" | awk '{print $5}' | head -1)
  [ -n "$PID" ] && taskkill //F //PID $PID
  cd Backend_portal && npm run start:dev   # run_in_background: true
  ```
  Nest tarda ~60-90s; un solo `ScheduleWakeup` de 90s basta. (`tsconfig.build.json`
  ya tiene `include: ["src/**/*"]`; antes el watcher reiniciaba por cualquier
  archivo fuera de `src/`.)

## Base de datos

- Prefijos de columnas: `sol_` (solicitudes), `sa_` (Solicitud_archivo), `fp_`
  (Formulario_pregunta), `fs_` (Formulario_secciones), `fr_`
  (Formulario_respuesta), `tdo_` (Tipos_documentos), `wet_`/`wee_`
  (workflow_etapas / workflow_estado_etapa), `cli_` (Clientes), `usr_` (usuarios).
- Migraciones en `C:\DAVID\CN\Z_Datos Cliente\DOCUMENTOS\migrations` (nombre =
  fecha): la fuente más confiable de qué columnas existen hoy. Correrlas con
  `node scripts/db-query.mjs "<ruta>.sql"`.
- Máquina de estados del workflow (`sol_ses_id` × `sol_wet_id` × `sol_wee_id` →
  quién actúa y con qué endpoint):
  `documentacion/Portal Clientes/Solicitudes/FLUJO_ETAPAS.md`. Consultarla en vez
  de reconstruir la lógica.
- BD compartida con el sistema Comercial (`Clientes`, `usuarios`): no modificar
  sus tablas ni su convención. `dbo.Clientes` tiene trigger → `UPDATE ... OUTPUT`
  necesita `INTO @tabla`.

## Arquitectura

- Dos patrones de acceso a datos:
  - **SQL crudo parametrizado** (`dataSource.query()` / `queryRunner.query()`) en
    casi todo `src/solicitudes/*` (`solicitudes.service.ts`,
    `solicitudes-workflow.service.ts`, `solicitudes-documentos.service.ts`,
    `solicitudes-listados.service.ts`, etc.).
  - **TypeORM** (`Repository<Entity>`) en parametrización simple:
    `formulario-preguntas`, `formulario-secciones`, `tipos-documentos`.
- **Tres sistemas de PDF, no intercambiables**:
  1. PDF completo de la solicitud: `pdf-lib`,
     `solicitudes.service.ts::generarPdfSolicitud`, `GET /solicitudes/:id/pdf`.
  2. Carta de Vinculación: `pdfkit`, `solicitudes-workflow.service.ts`
     (`generarPDFCarta`, `enviarCartaVinculacionPorCorreo`), tabla
     `param_carta_pdf_vinculacion`.
  3. Plantillas con placeholders: se generan **en el frontend**
     (`Frontend_Portal/src/lib/carta-pdf.util.ts`).
     `Tipos_documentos.tdo_tipo_plantilla` decide: `'TEXTO'` (3) o
     `'PDF_SOLICITUD'` (reusa 1).
- **Documento diferido**: `Formulario_pregunta` oculta al diligenciar
  (`fp_oculto_en_formulario` o su sección con `fs_oculta_en_formulario`) y
  vinculada a un `Tipos_documentos` con `tdo_tiene_plantilla=true`. No bloquea el
  llenado, pero si falta al enviar la solicitud queda en `sol_ses_id=2,
  sol_wet_id=1 (CLI), sol_wee_id=5 (PEND_FIRMA)` en vez de pasar al Ejecutivo.
- **Seguridad de endpoints**: para validar dueño usar los helpers
  `verificarDuenoSolicitud` / `verificarDuenoCliente` / `soloPersonalInterno`. En
  clientes `usr_id = cli_id`: usar `cliente_id`, nunca `req.user.id`.
- **Historial**: usuario `NULL` = acción del cliente (nunca `?? 1`).
- **Menú**: `PermissionsService.getModulesByUsuario` arma el árbol que devuelve
  el login (une todos los roles activos; entra un módulo si algún rol tiene
  `rm_ver = 1`). Detalle en `Frontend_Portal/CLAUDE.md`.

## Fechas: todo en hora Colombia (desde 2026-09-26)

`main.ts` fija `process.env.TZ = 'America/Bogota'` y TypeORM usa `useUTC: false`:
`datetime`/`date` se escriben y leen en hora Colombia, igual que Comercial. En
SQL, "ahora" es `dbo.fn_ahora_colombia()`, nunca `GETDATE()`/`SYSDATETIME()`
(DEV está en UTC-7). En Node, aritmética de días con getters **locales**
(`src/common/utils/business-days.util.ts`), no `getUTC*`. Un texto
`'YYYY-MM-DD'` en `new Date()` es medianoche UTC (el día anterior en Colombia):
usar `new Date(y, m - 1, d)`. Scripts sueltos con `TZ=America/Bogota`. Excepción:
consultas a SIESA siguen con `GETDATE()`. Detalle en
`documentacion/Portal Clientes/contexto general/manejo-fechas-zona-horaria.md`.

Días no hábiles de la semana parametrizables en `param_dias_no_habiles_semana`
(`dsh_dia_semana` 0=domingo..6=sábado, `dsh_co_id` NULL=todas), sin pantalla
(igual que `Festivos`). Callers: `solicitudes.service.ts` e
`historial-workflow.service.ts`, con fallback a sábado/domingo.

## Gotchas

- `wee_codigo` es `VARCHAR(10)`: códigos cortos (`PEND_FIRMA`).
- Queries sobre `Solicitud_archivo` deben alias-ear `sa.sa_fp_id AS fp_id` si el
  consumidor espera `fp_id` (ya hubo regresión: rompía "Reemplazar"/"Descargar
  plantilla").
- Nunca dejar scripts temporales (`tmp-*.js`) con la contraseña de la BD camino a
  un commit; revisar `git status` antes de `git add -A`.
- Columnas con nombre dinámico: `auth.service` arma `cli_`/`usr_` con
  `${prefijo}`. Antes de un `DROP COLUMN`, grep también por el sufijo.
- `fp_catalogo_base_datos` y `catalogo_base_datos` (en `fp_tabla_columnas`)
  deben quedar `NULL`; un nombre de BD quemado rompe `/maestros/catalogo` al
  cambiar de servidor.
- **`leftJoinAndSelect` + columnas `nvarchar(MAX)` = timeout de 15s** (500),
  aunque haya pocas filas: el JOIN multiplica filas con LOBs y SQL Server lo
  maneja mal (dos o más columnas MAX + JOIN ya tardan >15s). Pasó en
  `FormularioPreguntasService.findAll`. **No** usar `relationLoadStrategy:
  'query'` (TypeORM 0.3.28 devolvía `opciones` vacío en silencio). El fix que
  quedó: 3 `find()` independientes (preguntas, opciones con `In(fpIds)`,
  secciones con `In(seccionIds)`) unidos en JS con `Map`. Ante un 500 sin causa
  obvia en un `createQueryBuilder`, sospechar esto primero; el stack real solo
  sale en la consola de `start:dev` (`LogExceptionsFilter`). Y verificar el
  **contenido** de las relaciones, no solo status y tiempo.

## Scripts de verificación

```bash
node scripts/db-query.mjs "SELECT TOP 5 * FROM solicitudes"
node scripts/db-query.mjs "../Z_Datos Cliente/DOCUMENTOS/migrations/<archivo>.sql"
node scripts/mint-jwt.mjs ADMIN
node scripts/mint-jwt.mjs CLIENTE 13606   # segundo argumento = cliente_id
```

`mint-jwt.mjs` aún no pone `tv` (= `usuarios.usr_token_version`) ni `ejng_id`;
sin `tv` el backend responde 401. Mandar el token como cookie:
`curl -b "pc_token=<jwt>" http://localhost:4003/api/...`.
