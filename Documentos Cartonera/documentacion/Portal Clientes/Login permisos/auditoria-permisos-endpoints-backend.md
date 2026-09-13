# Auditoría: permisos y autorización de endpoints (backend)

Documento de análisis, no de acción — para revisar con calma antes de decidir
qué arreglar y en qué orden. Fecha: 2026-09-12.

> **Actualización 2026-09-12 — la mayoría de esto ya se corrigió.** Ver
> `plan-solucion-autorizacion-endpoints.md` para el diseño y su sección
> "Estado" para el detalle de qué quedó implementado y verificado (Ola 1:
> guard global, cierra `MaestrosController` y el resto de "sin guard
> alguno"; Ola 2: permisos finos en solicitudes/usuarios/roles/clientes/
> formulario-preguntas/pqrs/ampliacion-cupo/módulos) y qué sigue pendiente
> (`carta-pdf-vinculacion`, `tipos-vigencia`, los endpoints genéricos de
> `solicitudes.controller.ts`, y el guardrail de Ola 3). Este documento se
> deja tal cual como el diagnóstico original.

## El problema en una frase

El sistema tiene **cuatro mecanismos distintos** que deciden "quién puede
hacer qué", y no están conectados entre sí. Uno de ellos ni siquiera está
activado. El resultado es que varios endpoints quedaron protegidos solo a
medias — algunos completamente abiertos — sin que nadie lo haya decidido a
propósito.

## Para entender el resto del documento: 4 conceptos, explicados simple

1. **JWT (JSON Web Token)**: el "carnet" digital que recibe un usuario al
   hacer login. Cada request al backend lo manda (hoy vía la cookie
   `pc_token`, ver `migracion-auth-httponly.md`). El backend lo valida y
   sabe quién es el usuario y qué **rol** tiene (CLIENTE, ADMIN, EJECUTIVO,
   ASC, OC, CC1, CC2, COMERCIAL, ADMINISTRACION).

2. **`JwtAuthGuard`**: el primer filtro. Solo pregunta "¿este JWT es válido
   y el rol es uno de los 9 permitidos?". **No pregunta nada más** — no
   distingue si eres CLIENTE o ADMIN, ni qué puedes hacer. Si un endpoint
   solo tiene este guard, cualquiera de los 9 roles puede usarlo.

3. **`@Roles('ADMIN', 'ADMINISTRACION')` + `RolesGuard`**: el segundo
   filtro, opcional. Alguien tiene que agregarlo **a mano, endpoint por
   endpoint**, escribiendo los nombres de rol permitidos directamente en el
   código. Si se les olvida agregarlo en un endpoint sensible, ese endpoint
   queda con la protección débil del punto 2 (cualquier rol autenticado).

4. **`pc_modulos` / `pc_rol_modulo`**: dos tablas en la base de datos que
   dicen qué aparece en el **menú** de cada rol, con permisos finos por
   acción (`rm_ver`, `rm_crear`, `rm_editar`, `rm_eliminar`, `rm_aprobar`).
   Esto decide qué **botones ve** un usuario — no protege el endpoint real
   detrás de ese botón. Ver `menu-dinamico-pc-modulos.md` para el detalle
   de cómo arma el menú.

**El punto clave**: que un botón no aparezca en el menú (punto 4) no
significa que el endpoint esté protegido (puntos 2-3). Alguien podría
llamar al endpoint directamente (por ejemplo con `curl` o desde las
herramientas de desarrollador del navegador) aunque no vea el botón.

### Un quinto mecanismo, construido pero nunca conectado

Alguien en algún momento se dio cuenta de este problema y construyó una
solución: `ModulePermissionGuard` + `@RequierePermiso(ruta, accion)`
(`src/permissions/`). La idea era que un endpoint pudiera decir "para
ejecutarme, consulta `pc_rol_modulo` y fíjate si este rol tiene
`rm_crear` en true para este módulo" — uniendo el punto 3 y el punto 4 en
uno solo.

**Nunca se usó.** Confirmado por búsqueda en todo el código: `@RequierePermiso(`
tiene cero apariciones fuera de su propia definición, y el guard no está
registrado en ningún lado (`app.module.ts` no lo menciona). Es código que
existe, compila, pero no protege nada — quedó a medio construir.

## Hallazgos concretos, de más a menos grave

### 1. Base de datos completa expuesta sin login (`MaestrosController`)

`src/maestros/maestros.controller.ts` no tiene **ningún** guard en ningún
endpoint (ni siquiera el filtro básico del punto 2 de arriba):

- `GET /maestros/catalogo-esquema?mode=databases` — lista todas las bases
  de datos del servidor SQL.
- `GET /maestros/catalogo-esquema?mode=tables&base_datos=X` /
  `mode=columns&tabla=Y` — lista tablas y columnas de cualquier base.
- `GET /maestros/catalogo?tabla=Y&base_datos=X&columna_descripcion=Z&columna_id=W`
  — arma y ejecuta un `SELECT [Z],[W] FROM [X].[dbo].[Y]` y devuelve los
  datos (`maestros.service.ts:192-306`).

La única defensa es que valida que los nombres de tabla/columna no
contengan caracteres de inyección SQL (`isSafeIdentifier`) — no hay
whitelist de qué tablas se pueden consultar, y no hay que estar logueado.
En la práctica: cualquiera en internet que encuentre esta URL puede
enumerar y descargar datos de cualquier tabla del servidor, no solo las del
negocio del portal.

**Por qué es el más grave de todos**: los demás hallazgos requieren tener
al menos una sesión válida (ser CLIENTE, por ejemplo). Este no requiere
nada.

### 2. El flujo de aprobación de crédito puede ser manipulado por un CLIENTE

`src/solicitudes/solicitudes.controller.ts` es el controller más grande y
más inconsistente: no tiene guard a nivel de clase (a diferencia de casi
todos los demás controllers), así que cada endpoint depende de que alguien
le haya puesto el suyo.

**Endpoints de mutación con solo `JwtAuthGuard` (cualquiera de los 9 roles
puede llamarlos, incluido CLIENTE):**

| Línea | Endpoint | Qué permite hacer indebidamente |
|---|---|---|
| 1353-1354 | `PUT /solicitudes/:id/aprobacion` | Un CLIENTE aprueba o rechaza cualquier solicitud de crédito ajena |
| 1570-1571 | `PUT :id/concepto-comite-credito-2` | Un CLIENTE fija su propio cupo/plazo/forma de pago, suplantando al Comité de Crédito 2 |
| 1512-1513 | `concepto-oficial-cumplimiento` | Un CLIENTE escribe el concepto de cumplimiento de cualquier solicitud |
| 1544-1545 | `concepto-comite-credito-1` | Igual, suplantando al Comité 1 |
| 1482-1483 | `concepto-servicio-cliente` | Igual, suplantando al Auxiliar de Servicio al Cliente |
| 1297-1298, 1308-1309, 1656-1657, 1682-1683 | `PATCH :id/estado`, `PATCH :id/resultado-pendiente`, `PUT :id/estado-flujo`, `PUT :id/estado-flujo-automatico` | Forzar el estado/etapa de una solicitud directamente, saltándose el motor de aprobación — en teoría un CLIENTE podría mover su propia solicitud a "APROBADA" a mano |

**Endpoints sin ningún guard (ni login):**

`POST /solicitudes/respuestas` (línea 1140), el listado interno de
solicitudes pendientes por rol (OC/CC1/CC2/ASC, líneas 680-778), el detalle
completo de cualquier solicitud (`GET :id`, línea 995), su PDF (línea 316),
y las tablas de KYC (representante legal, accionistas, identificación) —
todo esto es alcanzable sin haber iniciado sesión.

### 3. Un CLIENTE puede crearse permisos de administrador

Tres controllers relacionados con usuarios y roles solo exigen
`JwtAuthGuard` (ningún `@Roles`):

- `src/usuarios/usuario.controller.ts` — crear/editar/borrar usuarios
  internos. Un CLIENTE podría crear un usuario con rol ADMIN.
- `src/usuario-roles/usuario-roles.controller.ts` — asignar o quitar
  cualquier rol a cualquier usuario.
- `src/modules/seguridad/roles/roles.controller.ts` (y su duplicado
  `src/seguridad/seguridad.controller.ts`) — crear roles nuevos y
  asignarles permisos (`rm_ver`/`rm_crear`/`rm_editar`/`rm_eliminar`/`rm_aprobar`)
  sobre cualquier módulo, es decir, escribir directamente en
  `pc_rol_modulo`.

Encadenando estos tres, un CLIENTE con sesión válida podría, en teoría,
crear un usuario ADMIN, o crear un rol nuevo con todos los permisos y
asignárselo a sí mismo.

### 4. `clientes.controller.ts` — cualquiera edita o borra cualquier empresa

`src/clientes/clientes.controller.ts` solo exige `JwtAuthGuard` en crear
(línea 74), editar (línea 108) y borrar (línea 116) — sin verificar que el
cliente sea "el suyo". Nótese que el mismo archivo sí hace bien las cosas en
`getPerfil`/`cambiarPasswordPerfil` (línea 40-49, usan
`@Roles('CLIENTE')`), lo que confirma que el equipo sabe aplicar el patrón
correcto — simplemente no lo hizo en estos tres endpoints.

### 5. Parametrización del formulario de crédito, sin ningún guard

Varios controllers de configuración no tienen ni el filtro básico:

- `parametrizacion/tipos-documentos.controller.ts` (crear/editar/borrar
  tipos de documento, subir imágenes de encabezado/pie)
- `parametrizacion/tipos-vigencia.controller.ts` (editar)
- `parametrizacion/dias-respuesta.controller.ts` (crear/editar/activar —
  son los SLA de respuesta por etapa)
- `parametrizacion/carta-pdf-vinculacion.controller.ts` (editar plantillas
  de cartas oficiales)
- `motivos-rechazo.controller.ts` (crear/editar/activar)
- `parametrizacion/formulario-preguntas.controller.ts` — **crear, editar y
  borrar preguntas y opciones del formulario de crédito** no tienen guard,
  mientras que los `GET` del mismo archivo sí exigen `JwtAuthGuard` — la
  escritura quedó menos protegida que la lectura, al revés de lo esperado.

(Nota aparte, sin urgencia: `src/documentos/documentos.controller.ts` tiene
el mismo problema, pero `DocumentosModule` no está registrado en
`app.module.ts` — hoy no es alcanzable. Queda como trampa si algún día se
activa sin revisar esto primero.)

### 6. Notificaciones — enviar correos arbitrarios

`src/notificaciones/notificaciones.controller.ts` tiene una mezcla rara:
algunos endpoints sí exigen `@Roles('ADMIN')` (líneas 21-22, 28-29, 46-47)
pero otros no:

- Línea 69, `POST /notificaciones/usuarios/credenciales/enviar` — cualquier
  rol autenticado puede hacer que el sistema envíe un correo con
  `usuario_password`/`usuario_email` arbitrarios, usando el dominio de
  correo legítimo del portal (vector de phishing).
- Línea 55, `POST /notificaciones/condiciones/:solicitudId/enviar` —
  cualquier rol puede enviar HTML arbitrario asociado a cualquier
  solicitud.

### 7. Otros mutadores sensibles solo con `JwtAuthGuard`

- `condiciones-financieras.controller.ts` — crear/editar/borrar las
  condiciones (cupo, plazo, forma de pago) de cualquier solicitud.
- `ampliacion-cupo.controller.ts` — editar/borrar cualquier solicitud de
  ampliación de cupo por id, sin verificar dueño.
- `modulos.controller.ts` — CRUD del árbol de menú.
- `pqrs.controller.ts` — actualizar/asignar cualquier PQRS por id.

## Contraejemplo: sí existe el patrón correcto en el repo

`src/consecutivos/consecutivos.controller.ts` hace esto bien:
`@UseGuards(JwtAuthGuard, RolesGuard)` a nivel de clase, y
`@Roles('ADMIN', 'ADMINISTRACION')` en cada endpoint. Esto demuestra que no
es que falte la herramienta — es que no se aplicó de forma consistente en
todo el proyecto.

## Sobre `pc_rol_modulo`: una excepción a "nunca se usa para autorización real"

Casi todo lo dicho arriba sobre "los permisos finos no protegen nada" es
cierto, con una sola excepción encontrada: `DELETE /solicitudes/:id`
(`solicitudes-documentos.service.ts:554-558`) sí consulta
`PermissionsService.tienePermiso(user, '/solicitudes', 'eliminar')` a mano
para decidir si un usuario **interno** (no CLIENTE) puede borrar una
solicitud — pero lo hace con una llamada directa en el service, no a través
del guard/decorator (`ModulePermissionGuard`/`@RequierePermiso`) construido
para eso, que sigue sin usarse en ningún lado.

## Qué significaría "arreglarlo bien" (para cuando se decida actuar)

No es agregar `@Roles(...)` a cada endpoint uno por uno a las apuradas —
eso es parche sobre parche, el mismo patrón que causó este problema (cada
endpoint protegido "a mano" e independiente). Las opciones reales, de menor
a mayor esfuerzo:

1. **Parche rápido por prioridad**: agregar `@Roles(...)` a los endpoints
   más críticos de la lista de arriba (Maestros primero — ese ni siquiera
   necesita `@Roles`, solo `JwtAuthGuard` ya sería una mejora enorme; luego
   aprobación de solicitudes; luego usuarios/roles). Rápido, pero sigue sin
   una fuente de verdad única — el próximo endpoint nuevo puede volver a
   quedar sin protección si nadie se acuerda.
2. **Guard global por defecto** (`APP_GUARD` en `app.module.ts`): que todo
   endpoint nuevo requiera `JwtAuthGuard` a menos que se marque
   explícitamente como público (`@Public()`) — así "olvidarse de proteger"
   deja de ser posible por omisión; hoy es al revés (desprotegido por
   defecto).
3. **Terminar de conectar `ModulePermissionGuard`**: ya existe, ya sabe
   consultar `pc_rol_modulo`. Conectarlo de verdad uniría "qué aparece en
   el menú" con "qué puede ejecutar el backend" en una sola fuente de
   verdad, eliminando el mecanismo 3 (`@Roles` a mano) como fuente de
   duplicación. Es el camino correcto a mediano plazo, pero es el de más
   trabajo (hay que decidir la ruta/`mod_ruta` correcta para cada endpoint,
   y probar que no se rompa nada de lo que hoy funciona).

Esto es material para decidir con calma, no para ejecutar de una — el
objetivo de este documento es que quede todo el contexto de una sola vez
para cuando quieras retomarlo.
