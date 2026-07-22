# Migración inicial de clientes ya existentes en SIESA

Idea pendiente (no implementada) — diseño conversado con el usuario el
2026-07-14, guardado para retomar cuando haya acceso real a SIESA.

## Contexto

Los datos de las solicitudes de este portal terminan yendo a SIESA (sistema
contable/ERP externo — ver `BACKEND/src/integraciones/uno/`, hoy un stub
completamente vacío: `uno.service.ts`, `uno.module.ts`,
`entities/integracion-uno.entity.ts` y `retry.job.ts` no tienen ninguna
lógica, y `UnoModule` ni siquiera está importado en `app.module.ts`).

El problema: hay clientes que **ya existen y ya están aprobados en SIESA**
desde antes de que existiera este portal. No tendría sentido hacerlos pasar
por las 5 etapas de aprobación (Ejecutivo → Auxiliar → Oficial de
Cumplimiento → Comité 1 → Comité 2) como si fueran prospectos nuevos — ya
fueron aprobados en el mundo real. Se necesita un proceso que los migre
automáticamente, consultando SIESA, en vez de llenar un formulario manual
por cada uno.

**Acceso a SIESA**: todavía no resuelto — el usuario eventualmente va a
tener acceso, pero el mecanismo exacto (BD directa, API, archivo) no está
decidido aún. Sí hay evidencia de que el acceso por **base de datos
directa** es viable: `C:\Users\Dynabook\Downloads\1. Consulta de Pedido por
Item.sql` es un query real contra SIESA (consulta de pedidos por ítem, no
de clientes/cupo) que usa la convención de tablas propia de SIESA
(`t200_mm_terceros` = terceros, `t201_mm_clientes` = extensión de cliente
sobre un tercero, `t430_cm_pv_docto`/`t431_cm_pv_movto` = documentos/movimientos
de venta, etc.). Cuando se retome esto, probablemente la tabla de clientes
y cupo esté en `t200_mm_terceros`/`t201_mm_clientes` o similares — hay que
pedir/armar la consulta equivalente para maestro de cliente + cupo
aprobado, no asumir que es la misma consulta de este archivo. 

## Progreso confirmado (2026-07-21) — Datos de identificación del tercero

El usuario ejecutó manualmente contra SIESA (no desde esta app — sigue sin
existir una conexión propia a SIESA en el backend) la siguiente consulta
para traer el maestro de un tercero por NIT, y confirmó que devuelve datos
reales:

```sql
DECLARE @p_cia SMALLINT = 1
DECLARE @p_nit VARCHAR(20) = '800092967'

SELECT
    t200.f200_rowid          AS f_rowid_tercero,
    t200.f200_nit             AS f_nit,
    t200.f200_razon_social    AS f_razon_social,
    t200.f200_id_cia          AS f_id_cia
FROM t200_mm_terceros t200
WHERE t200.f200_id_cia = @p_cia
  AND t200.f200_nit    = @p_nit
```

Respuesta real confirmada:

| f_rowid_tercero | f_nit | f_razon_social | f_id_cia |
|---|---|---|---|
| 14858 | 800092967 | INDUSTRIAS DONSSON SAS | 1 |

Esto cubre solo la parte de **datos de identificación** (rowid, NIT, razón
social) — sigue sin confirmarse dirección, ciudad, tipo de identificación,
teléfono, e-mail.

Siguiendo el mismo patrón que se usó para el módulo `pedidos`
(`BACKEND/src/pedidos/pedidos.service.ts`: consulta real comentada +
respuesta quemada con un dato real de ejemplo, lista para descomentar
cuando haya conexión real a SIESA), esta consulta quedó montada en
`BACKEND/src/integraciones/uno/uno.service.ts` — antes un stub vacío, ahora
con `obtenerDatosIdentificacionPorNit(nit)` exponiendo esto mismo vía
`GET /api/integraciones/uno/clientes/:nit`.

## Progreso confirmado (2026-07-21) — Cupo, plazo de pago y sucursal (`t201_mm_clientes`)

Segunda consulta confirmada, sobre la extensión de cliente del mismo
tercero (`f201_rowid_tercero = 14858`, el rowid ya confirmado arriba):

```sql
SELECT TOP 5 *
FROM t201_mm_clientes
WHERE f201_rowid_tercero = 14858
```

Respuesta real confirmada (columnas relevantes para la migración; la tabla
completa tiene más columnas de control interno de SIESA no listadas aquí):

| Columna SIESA | Valor de ejemplo | Mapea a |
|---|---|---|
| `f201_id_sucursal` | `002` | Sucursal del cliente en SIESA |
| `f201_descripcion_sucursal` | INDUSTRIAS DONSSON SAS | — |
| `f201_cupo_credito` | 127.500.000,00 | **`sol_cupo_aprobado`** — ya resuelto |
| `f201_id_cond_pago` | `08` | **`sol_plazo_pago`** — código de condición de pago propio de SIESA, falta mapear a los valores que usa el portal |
| `f201_id_vendedor` | `230` | Candidato a mapear → `ejng_id` (ejecutivo de negocio) |
| `f201_id_tipo_cli` | `1302` | Tipo de cliente en SIESA |
| `f201_id_moneda` | `COP` | — |
| `f201_ind_estado_activo` | `1` | Si el cliente está activo en SIESA |
| `f201_ind_bloqueo_cupo` / `f201_ind_bloqueo_mora` | `0` / `0` | Bloqueos de cartera — relevante para decidir si migrar un cliente bloqueado |
| `f201_fecha_ingreso` | 2018-08-13 | — |
| `f201_fecha_cupo` | 2026-05-29 | Fecha del cupo vigente |
| `f201_notas` | "24/06/2024 - AUMENTO TEMPORAL DE CUPO..." | Texto libre, sin estructura |

**No resuelto todavía en esta tabla:** `sol_forma_pago` (no hay una columna
obvia de "forma de pago" separada de `f201_id_cond_pago` — puede que sea el
mismo dato, o que forma de pago sea un catálogo aparte del condición de
pago; falta confirmar), ni dirección/ciudad/país (esta tabla tampoco los
trae).

## Progreso confirmado (2026-07-21) — Fila completa del tercero (`t200_mm_terceros`)

Tercera consulta confirmada, la fila completa del mismo tercero
(`f200_rowid = 14858`):

```sql
SELECT TOP 1 * FROM t200_mm_terceros WHERE f200_rowid = 14858
```

Columnas relevantes de la respuesta real:

| Columna SIESA | Valor de ejemplo | Nota |
|---|---|---|
| `f200_dv_nit` | `2` | Dígito de verificación del NIT |
| `f200_id_tipo_ident` | `N` | Tipo de identificación en SIESA — falta el catálogo completo de códigos (`N` = NIT, probablemente `C`/`E` etc. para otros) para mapear a `cli_tipo_identificacion` del portal |
| `f200_ind_tipo_tercero` | `2` | Persona jurídica (correlaciona con `f200_apellido1`/`f200_apellido2`/`f200_nombres` vacíos — esas 3 columnas son para persona natural) |
| `f200_id_ciiu` | `4530` | Código de actividad económica |
| `f200_ind_cliente` | `1` | Confirma que el tercero es cliente (vs. proveedor/empleado/accionista) |
| `f200_ind_estado` | `1` | Activo |
| `f200_rowid_contacto` | `31646` | **Clave** — el maestro de tercero NO tiene dirección/teléfono/e-mail propios; apunta a un contacto. En la consulta de pedidos, la dirección de un documento salía de `t419_mc_contactos_docto` vía un rowid de contacto análogo — candidato fuerte para ser la misma tabla o una hermana. Pendiente de confirmar con un `SELECT TOP 1 * FROM t419_mc_contactos_docto WHERE f419_rowid = 31646`. |

## Progreso confirmado (2026-07-21) — Contacto/dirección (`t419_mc_contactos_docto`)

Cuarta consulta confirmada — se confirmó que `t419_mc_contactos_docto`
también sirve como tabla de contacto del maestro de tercero, no solo de
documentos:

```sql
SELECT TOP 1 * FROM t419_mc_contactos_docto WHERE f419_rowid = 31646
```

| Columna SIESA | Valor de ejemplo | Mapea a |
|---|---|---|
| `f419_contacto` | LUZ ADRIANA RESTREPO | Nombre del contacto (candidato para "Nombre del Funcionario que diligencia") |
| `f419_direccion1` | CAMPESTRE CALLE 10 # 57 -14 | **`cli_direccion`** — resuelto |
| `f419_id_pais` | `169` | **`pai_id`** — código SIESA, falta mapear al catálogo geográfico del portal (ojo con el bug ya conocido de `fp_id` 1154/1155/1156) |
| `f419_id_depto` | `13` | **`dpto_id`** — mismo comentario que país |
| `f419_id_ciudad` | `001` | **`ciu_id`** — mismo comentario que país |
| `f419_telefono` | 4182500 | Teléfono de contacto |
| `f419_email` | (vacío para este cliente) | **`cli_correo`** — columna confirmada, pero vacía en este ejemplo; falta ver un caso con dato para confirmar formato |
| `f419_celular` | NULL | — |

Con esto, **DATOS DE IDENTIFICACIÓN queda prácticamente resuelto**: tipo de
documento, NIT, razón social, país, departamento, ciudad, dirección y
teléfono ya tienen consulta confirmada. Sigue pendiente solo confirmar
`f419_email` con un cliente que sí tenga correo cargado, y el mapeo de los
catálogos SIESA (tipo identificación `N`/país `169`/depto `13`/ciudad `001`)
a los IDs propios del portal.

## Progreso confirmado (2026-07-21) — SOLICITUD DE CRÉDITO: catálogo de condiciones de pago (`t208_mm_condiciones_pago`)

Se buscó "forma de pago" en todo el catálogo de columnas de SIESA
(`INFORMATION_SCHEMA.COLUMNS` filtrando por `%forma%`/`%pago%`) para no
adivinar nombre de tabla. La mayoría de resultados son de un esquema
BI/staging (prefijos `BI_`/`SD_`/`SE_`), no de las tablas operativas
`tNNN_mm_...` que ya veníamos usando. El candidato real más prometedor era
`t208_mm_condiciones_pago.f208_id_medio_pago`:

```sql
SELECT TOP 10 * FROM t208_mm_condiciones_pago
```

Resultado real — confirma el catálogo de **plazo de pago** (código →
descripción/días), pero **`f208_id_medio_pago` viene `NULL` en todas las
filas** (callejón sin salida para forma de pago por esta vía):

| `f208_id` | `f208_descripcion` | `f208_dias_vcto` | `f208_id_medio_pago` |
|---|---|---|---|
| `08` | CREDITO 60 DIAS | 60 | NULL |
| `07` | CREDITO 45 DIAS | 45 | NULL |
| `06` | CREDITO 30 DIAS | 30 | NULL |
| `05` | CREDITO 15 DIAS | 15 | NULL |
| `04` | CREDITO 8 DIAS | 8 | NULL |
| `02` | C0NTADO 1 DIA | 1 | NULL |
| `01` | ANTICIPADO | 1 | NULL |

**`sol_plazo_pago` queda 100% resuelto**: `t201_mm_clientes.f201_id_cond_pago`
(`08` para INDUSTRIAS DONSSON SAS) es la llave hacia
`t208_mm_condiciones_pago.f208_id`, que da la descripción legible
("CREDITO 60 DIAS") y los días exactos (`f208_dias_vcto` = 60) — no hace
falta mapear código a código, basta con guardar/mostrar la descripción o
los días.

**`sol_forma_pago` se descarta como dato de SIESA — confirmado, no es un
callejón abierto.** Se llegó hasta el catálogo base real de medios de pago,
`t025_mm_medios_pago` (encontrado buscando en `INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME LIKE '%medio%'`, tras descartar `t0251`/`t0253`/`t1114`/
`t1118` por ser configuración de promociones/liquidación, no de cliente):

```sql
SELECT TOP 10 * FROM t025_mm_medios_pago
```

Resultado real: es un catálogo de **canales de recaudo** (bancos,
consignaciones, comercio exterior, TIDIS — ej. `C01` = "CONSG BCO BOGOTA
5225", `CEX` = "COMERCIO EXTERIOR"). Describe *cómo entra la plata* en una
transacción puntual, no una "forma de pago" pactada con el cliente
(efectivo/crédito/transferencia) como espera el formulario del portal.
Tampoco hay columna de medio/forma de pago en `t201_mm_clientes` (ya vista
completa arriba).

**Conclusión: `sol_forma_pago` no tiene equivalente a nivel de cliente en
SIESA.** Para la migración, hay que decidir un valor por defecto o pedirlo
manualmente — no bloquear el resto de la migración por este campo.

## Progreso confirmado (2026-07-21) — INFORMACIÓN GENERAL: solo Código CIIU tiene dato en SIESA

Se revisaron los ~25 campos únicos de la sección "INFORMACIÓN GENERAL"
(`Formulario_pregunta` con `seccion_id = 2`). La inmensa mayoría son
preguntas de cumplimiento/KYC que un ERP comercial no suele guardar: LA/FT
(¿tiene sistema?, ¿cuál?), certificaciones, uso de zona franca, "el
producto es para consumo", capital registrado, origen de fondos, tiempo de
funcionamiento, número de matrícula mercantil.

De esos campos, **"Código CIIU" ya está resuelto** — es el mismo
`t200_mm_terceros.f200_id_ciiu` visto en la consulta de datos de
identificación (`4530` para INDUSTRIAS DONSSON SAS).

Se intentó además buscar Régimen tributario / Gran Contribuyente /
Autorretenedor (impuestos que un ERP sí suele controlar, para cálculo de
retenciones en facturación) buscando en todo el catálogo de columnas:

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME LIKE '%regimen%'
   OR COLUMN_NAME LIKE '%autorreten%'
   OR COLUMN_NAME LIKE '%gran_contrib%'
   OR COLUMN_NAME LIKE '%grancontrib%'
```

**Sin resultados útiles** — lo único que aparece con "regimen" es régimen
*laboral* (nómina de empleados, tablas `w05xx`/`w0651`/`w0806`) o de salud
(`t1857_mc_regimen_salud_categ`), no régimen tributario de un tercero/
cliente. Nada para "autorretenedor" ni "gran contribuyente" con ese nombre
en todo el esquema.

**Conclusión: de ~25 campos de esta sección, solo Código CIIU viene de
SIESA.** El resto (régimen, gran contribuyente, autorretenedor, LA/FT,
certificaciones, zona franca, capital registrado, origen de fondos, etc.)
no tiene equivalente reconocible — quedan como diligenciamiento manual
igual que `sol_forma_pago`, salvo que aparezca otra pista más adelante.

## Progreso confirmado (2026-07-21) — REPRESENTANTE LEGAL: sin equivalente en SIESA

La sección "REPRESENTANTE LEGAL PRINCIPAL Y SUPLENTES" pide, por tabla:
Apellidos y Nombre, Identificación, Ciudad de Expedición, Dirección. Se
buscó en todo el catálogo de columnas:

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE COLUMN_NAME LIKE '%representante%'
   OR COLUMN_NAME LIKE '%rep_legal%'
```

Los únicos resultados (`t525_gc_ci_cp`, `w0494_contratos_inm_propiet`)
pertenecen a otros módulos de SIESA sin relación con clientes comerciales
(gestión de calidad / contratos de inmuebles). **Conclusión: representante
legal, y por extensión PEPs e identificación de accionistas (composición
accionaria), son datos de cumplimiento/KYC que muy probablemente no viven
en SIESA** (es un ERP contable/comercial, no un sistema de debida
diligencia) — se dejan de buscar por esta vía, quedan como
diligenciamiento manual.

## Progreso confirmado (2026-07-21) — INFORMACIÓN PARA DESPACHOS (`t215_mm_puntos_envio_cliente`)

La sección pide una tabla "Direcciones" (país, depto, ciudad, dirección,
zona franca, horario) para cada punto de entrega adicional. Se encontró
`t215_mm_puntos_envio_cliente` porque ya aparecía en la consulta de
pedidos original (unida ahí vía `t430_docto.f430_rowid_punto_envio_rem`).
Se confirmó que también se puede consultar directo por tercero:

```sql
SELECT * FROM t215_mm_puntos_envio_cliente WHERE f215_rowid_tercero = 14858
```

Respuesta real — INDUSTRIAS DONSSON SAS tiene **dos** puntos de envío
activos (confirma que es una relación 1-a-muchos, como pide el formulario):

| `f215_id_sucursal` | `f215_descripcion` | `f215_rowid_contacto` | `f215_id_vendedor` | `f215_ind_estado` |
|---|---|---|---|---|
| `002` | INDUSTRIAS DONSSON SAS | 31647 | 230 | 1 |
| `002` | SUCURSAL BOGOTA | 32490 | 230 | 1 |

`f215_rowid_contacto` apunta a la misma tabla de contactos ya resuelta
(`t419_mc_contactos_docto`) — el primer punto (31647) es el mismo contacto
principal del tercero visto en "Datos de identificación" (LUZ ADRIANA
RESTREPO). **`sol_es_zona_franca` sigue sin columna propia aquí** — el
formulario la pide por punto de entrega (`SI_NO`), pero ninguna columna de
`t215` ni `t419` la trae; a confirmar si vive en otro lado o si toca
decidirla manualmente por punto.

## Progreso confirmado (2026-07-21) — Consulta consolidada (identificación + contacto + crédito)

Con las piezas confirmadas hasta ahora se armó una primera consulta
consolidada de cliente por NIT (pendiente de correr contra SIESA para
confirmar que los JOIN funcionan igual que por separado):

```sql
DECLARE @p_cia SMALLINT = 1
DECLARE @p_nit VARCHAR(20) = '800092967'

SELECT
    -- Identificación
    t200.f200_rowid           AS f_rowid_tercero,
    t200.f200_nit              AS f_nit,
    t200.f200_dv_nit            AS f_dv_nit,
    t200.f200_id_tipo_ident      AS f_tipo_identificacion,
    t200.f200_razon_social        AS f_razon_social,
    t200.f200_ind_tipo_tercero      AS f_ind_tipo_tercero,
    t200.f200_id_ciiu                AS f_ciiu,
    t200.f200_ind_estado              AS f_ind_estado,

    -- Contacto / dirección principal
    tct.f419_contacto     AS f_contacto,
    tct.f419_direccion1    AS f_direccion,
    tct.f419_id_pais        AS f_pai_id,
    tct.f419_id_depto        AS f_dpto_id,
    tct.f419_id_ciudad        AS f_ciu_id,
    tct.f419_telefono          AS f_telefono,
    tct.f419_email              AS f_email,

    -- Crédito y plazo de pago
    t201.f201_id_sucursal         AS f_id_sucursal,
    t201.f201_cupo_credito         AS f_cupo_credito,
    t201.f201_id_cond_pago           AS f_id_cond_pago,
    t208.f208_descripcion             AS f_desc_cond_pago,
    t208.f208_dias_vcto                AS f_dias_cond_pago,
    t201.f201_id_vendedor                AS f_id_vendedor,
    t201.f201_id_tipo_cli                  AS f_id_tipo_cli,
    t201.f201_ind_estado_activo              AS f_ind_activo,
    t201.f201_ind_bloqueo_cupo                 AS f_ind_bloqueo_cupo,
    t201.f201_ind_bloqueo_mora                   AS f_ind_bloqueo_mora

FROM t200_mm_terceros t200
LEFT JOIN t419_mc_contactos_docto tct
       ON tct.f419_rowid = t200.f200_rowid_contacto
LEFT JOIN t201_mm_clientes t201
       ON t201.f201_rowid_tercero = t200.f200_rowid
      AND t201.f201_id_cia = t200.f200_id_cia
LEFT JOIN t208_mm_condiciones_pago t208
       ON t208.f208_id = t201.f201_id_cond_pago
      AND t208.f208_id_cia = t201.f201_id_cia
WHERE t200.f200_id_cia = @p_cia
  AND t200.f200_nit    = @p_nit
```

Puntos de envío van aparte por ser 1-a-muchos (no se puede unir sin
duplicar la fila del cliente):

```sql
SELECT
    t215.f215_id_sucursal    AS f_id_sucursal,
    t215.f215_descripcion     AS f_descripcion_punto,
    t215.f215_id_vendedor       AS f_id_vendedor,
    t215.f215_ind_estado          AS f_ind_estado,
    tct2.f419_direccion1             AS f_direccion,
    tct2.f419_id_pais                  AS f_pai_id,
    tct2.f419_id_depto                   AS f_dpto_id,
    tct2.f419_id_ciudad                    AS f_ciu_id,
    tct2.f419_telefono                        AS f_telefono
FROM t215_mm_puntos_envio_cliente t215
INNER JOIN t419_mc_contactos_docto tct2
        ON tct2.f419_rowid = t215.f215_rowid_contacto
WHERE t215.f215_rowid_tercero = 14858
  AND t215.f215_ind_estado    = 1
```

## Progreso confirmado (2026-07-21) — CONTACTOS (Compras/Almacén/Calidad/Tesorería/Financiera): mecanismo existe, sin datos

La sección pide una tabla de contactos por área con Nombre, Cargo,
Teléfono, Correo. El contacto único ya resuelto (`t419_mc_contactos_docto`)
no tiene columna de "Cargo" ni concepto de área, así que se buscaron tablas
de contacto adicionales:

```sql
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%contacto%'
```

Aparecieron dos tablas prometedoras — `t2008_mm_otros_contactos_ter`
(por tercero) y `t2013_mm_otros_contactos_cli` (por cliente, mismo sufijo
`_cli` que `t201_mm_clientes`) — y un catálogo `w0771_gh02_cargo_contactos`
que confirma que "cargo" sí es un concepto que SIESA maneja para contactos.
Ambas tienen la estructura correcta para resolver esta sección (relacionan
tercero/cliente + una "clase de otro contacto" + un rowid de contacto):

```sql
SELECT * FROM t2013_mm_otros_contactos_cli   -- vacía
SELECT * FROM t2008_mm_otros_contactos_ter WHERE f2008_rowid_tercero = 14858   -- vacía
```

**Ambas devolvieron 0 filas para INDUSTRIAS DONSSON SAS.** A diferencia de
representante legal/PEPs (donde no existía ninguna tabla candidata), aquí
el mecanismo sí existe en el esquema, pero no tiene datos cargados — puede
ser que esta empresa nunca haya usado esta función de SIESA, o que solo
aplique a clientes más nuevos. **Pendiente**: probar con un NIT distinto
que sí tenga contactos por área cargados, antes de descartar la sección
por completo.

## Progreso confirmado (2026-07-21) — FACTURACIÓN ELECTRÓNICA: mismo mecanismo que CONTACTOS

La sección pide tabla Nombre/Cargo/Correo electrónico — misma forma que
CONTACTOS, casi seguro el mismo mecanismo `t2008_mm_otros_contactos_ter` /
`t2013_mm_otros_contactos_cli` con una "clase de contacto" distinta
(`f2008_rowid_otro_contac_clase` probablemente distingue COMPRAS/ALMACÉN/
FACTURACIÓN ELECTRÓNICA/etc. mediante un catálogo aún no revisado). Como ya
se confirmó que ambas tablas están vacías para este cliente, no se
justifica correr una consulta nueva — mismo resultado: mecanismo existe,
sin datos, misma pendiente de probar con otro NIT.

## Exploración completa del formulario (2026-07-21) — cierre

Se revisaron las 14 secciones de `Formulario_secciones` (`formulario_id =
1`) una por una contra el esquema de SIESA. Las que faltaban por verificar
explícitamente (antes se habían descartado por parecido con Representante
Legal, sin confirmar sus campos reales):

- **IDENTIFICACIÓN PEPs REPRESENTANTE LEGAL** (`seccion_id = 3`): solo
  preguntas SELECT sí/no (¿es/fue persona políticamente expuesta?,
  ¿administra recursos públicos?, ¿tiene reconocimiento público?, ¿tiene
  grado de poder público?) más una nota explicativa. **Confirmado: sin
  equivalente en SIESA.**
- **COMPOSICIÓN ACCIONARIA** (`seccion_id = 1008`): tabla accionistas
  (Nombre/Razón Social, Tipo de Identificación, No. Identificación, %
  Participación). **Confirmado: sin equivalente en SIESA** (dato
  societario/KYC, no comercial).
- **Personas Beneficiarias de Comercio Exterior** (`seccion_id = 1013`):
  tabla Nombre/Identificación/Dirección. **Confirmado: sin equivalente en
  SIESA** (mismo patrón KYC que representante legal).
- **Aviso legal** (`1006`), **Acuerdo de Información Relevante** (`1011`),
  **Acuerdo** (`2007`): solo texto legal (`NOTA`), checkboxes "Estoy de
  acuerdo" y espacios de firma/sello. Sin ningún campo de dato.
- **Documentos Requeridos** (`1003`): checklist de archivos a subir (RUT,
  cédula del representante legal, certificado de existencia y
  representación legal, estados financieros, certificaciones, manifestación
  suscrita F-P3-07). Son documentos escaneados, no datos estructurados —
  fuera de alcance de una consulta SQL.

**Con esto queda cerrada la exploración completa de las 14 secciones del
formulario.** Resumen final:

| Sección | Estado |
|---|---|
| Datos de identificación | ✅ Resuelta (`t200_mm_terceros` + `t419_mc_contactos_docto`) |
| Solicitud de crédito | ✅ Cupo/plazo resueltos (`t201_mm_clientes` + `t208_mm_condiciones_pago`); forma de pago manual |
| Información para despachos | ✅ Resuelta (`t215_mm_puntos_envio_cliente` + `t419_mc_contactos_docto`) |
| Información general | Solo Código CIIU (`t200_mm_terceros.f200_id_ciiu`); resto manual |
| Contactos por área / Facturación electrónica | Mecanismo existe (`t2008`/`t2013_mm_otros_contactos_*`), sin datos para este cliente — pendiente probar otro NIT |
| Representante legal / PEPs / Composición accionaria / Personas beneficiarias comercio exterior | ❌ Sin equivalente en SIESA — KYC puro, manual |
| Aviso legal / Acuerdos / Documentos requeridos | No aplica — texto legal o archivos escaneados, no datos |

## Consulta final consolidada (2026-07-21) — lista para precargar el formulario

Con todas las piezas confirmadas arriba, esta es la consulta pensada ya
para el caso de uso real: traer de SIESA lo necesario para precargar un
formulario de vinculación al migrar un cliente existente. Los alias usan
nombres pensados para el formulario/portal, no solo el nombre técnico de
SIESA, para que el mapeo sea obvio de un vistazo.

```sql
DECLARE @p_cia SMALLINT = 1
DECLARE @p_nit VARCHAR(20) = '800092967'

SELECT
    -- ── Identificación ──────────────────────────────────────────
    t200.f200_rowid              AS rowid_tercero,
    t200.f200_nit                 AS no_identificacion,
    t200.f200_dv_nit               AS dv_nit,
    t200.f200_id_tipo_ident         AS tipo_documento,          -- código SIESA (ej. 'N'), falta mapear a catálogo del portal
    t200.f200_razon_social           AS razon_social,
    t200.f200_ind_tipo_tercero         AS ind_persona_juridica,  -- 2 = jurídica
    t200.f200_ind_estado                AS ind_activo_siesa,

    -- ── Contacto / dirección ────────────────────────────────────
    tct.f419_contacto     AS nombre_contacto,
    tct.f419_direccion1     AS direccion,
    tct.f419_id_pais          AS pais,          -- código SIESA, falta mapear
    tct.f419_id_depto           AS departamento,  -- código SIESA, falta mapear
    tct.f419_id_ciudad            AS ciudad,         -- código SIESA, falta mapear
    tct.f419_telefono                AS numero_telefonico,
    tct.f419_email                     AS email,   -- confirmado que existe, pendiente ver un caso con dato

    -- ── Información general ─────────────────────────────────────
    t200.f200_id_ciiu     AS codigo_ciiu,

    -- ── Solicitud de crédito ─────────────────────────────────────
    t201.f201_id_sucursal         AS id_sucursal,
    t201.f201_cupo_credito         AS cupo_solicitado,
    t201.f201_id_cond_pago           AS cod_plazo_pago,
    t208.f208_descripcion             AS desc_plazo_pago,   -- ej. "CREDITO 60 DIAS"
    t208.f208_dias_vcto                AS dias_plazo_pago,    -- ej. 60
    NULL                                 AS forma_pago,          -- no existe en SIESA, manual

    -- ── Otros / candidatos a mapear ──────────────────────────────
    t201.f201_id_vendedor         AS cod_vendedor,       -- candidato a ejng_id, falta mapear
    t201.f201_ind_estado_activo    AS ind_activo_cliente,
    t201.f201_ind_bloqueo_cupo      AS ind_bloqueo_cupo,
    t201.f201_ind_bloqueo_mora        AS ind_bloqueo_mora

FROM t200_mm_terceros t200
LEFT JOIN t419_mc_contactos_docto tct
       ON tct.f419_rowid = t200.f200_rowid_contacto
LEFT JOIN t201_mm_clientes t201
       ON t201.f201_rowid_tercero = t200.f200_rowid
      AND t201.f201_id_cia = t200.f200_id_cia
LEFT JOIN t208_mm_condiciones_pago t208
       ON t208.f208_id = t201.f201_id_cond_pago
      AND t208.f208_id_cia = t201.f201_id_cia
WHERE t200.f200_id_cia = @p_cia
  AND t200.f200_nit    = @p_nit
```

Puntos de entrega adicionales van aparte por ser 1-a-muchos (no cabe en la
fila de arriba sin duplicarla):

```sql
SELECT
    t215.f215_id_sucursal    AS id_sucursal,
    t215.f215_descripcion     AS nombre_punto,
    tct2.f419_direccion1        AS direccion,
    tct2.f419_id_pais             AS pais,
    tct2.f419_id_depto              AS departamento,
    tct2.f419_id_ciudad               AS ciudad,
    tct2.f419_telefono                  AS telefono
FROM t215_mm_puntos_envio_cliente t215
INNER JOIN t419_mc_contactos_docto tct2
        ON tct2.f419_rowid = t215.f215_rowid_contacto
WHERE t215.f215_rowid_tercero = 14858
  AND t215.f215_ind_estado    = 1
```

**Pendiente para que esto sea 100% "traer el formulario" automáticamente**:
mapear los códigos de SIESA (`tipo_documento`, `pais`, `departamento`,
`ciudad`, `cod_vendedor`) a los IDs propios del portal — eso es una tabla
de equivalencias a construir aparte, no algo que resuelva la consulta en sí.

## Diseño acordado

### 1. Disparo: job programado, no manual

Se piensa como un proceso automático recurrente (no algo que alguien
dispare a mano cada vez) — el stub vacío `retry.job.ts` ya sugiere que
originalmente se había pensado en un job con reintentos para esto mismo.
Encaja como el punto de partida real para implementar la integración
`uno` en vez de dejarla vacía.

### 2. Por cada cliente que traiga la consulta a SIESA

- Buscar si ya existe en `Clientes` por NIT (`cli_nro_identificacion`).
  - No existe → crearlo (mismo mecanismo que `ClientesService.create()`).
  - Ya existe → revisar si ya tiene una solicitud "migrada" antes de crear
    una nueva, para que el job sea **idempotente** (no duplicar en cada
    corrida).

### 3. Crear la solicitud ya aprobada, sin pasar por el workflow

Igual que ya se hace en `BACKEND/src/ampliacion-cupo/ampliacion-cupo.service.ts`
(inserta una solicitud saltándose etapas): `INSERT` directo en `solicitudes`
con:
- `sol_estado_id = 5` (APROBADA, tabla real `solicitud_estados` — ver
  `documentacion/FLUJO_ETAPAS.md`)
- `sol_etapa_actual_id` = CC2, `sol_resultado_etapa_id` = APROBADO
- `sol_cupo_aprobado` / `sol_plazo_pago` / `sol_forma_pago` ya poblados con
  lo que traiga SIESA

### 4. Dejar rastro de que fue migración, no aprobación real

Preocupación explícita del usuario: que no quede como si un humano hubiera
revisado/aprobado esa solicitud paso a paso en este sistema. Dos cosas:

- Insertar igual una fila en `solicitud_workflow_historial` (con un
  comentario tipo "Migrado desde SIESA" en `swh_comentario`), para que
  quede un registro aunque sea sintético.
- Agregar una columna nueva para diferenciar el origen, ej.
  `sol_origen` (`'MIGRACION_SIESA'` vs `'PORTAL'`, o el valor que se
  decida) — no existe hoy, requeriría su propia migración de esquema.

### 5. Manejo de fallos por cliente, no por lote completo

Si consultar/crear un cliente puntual falla, no debe tumbar todo el batch
— registrar cuáles fallaron para reintentar después (para esto ya estaba
pensado `retry.job.ts`).

## Variables necesarias (verificado contra columnas reales NOT NULL de `Clientes`/`solicitudes`)

### Deberían venir de SIESA, por cliente

| Variable del portal | Qué es | Nota |
|---|---|---|
| `cli_nro_identificacion` | NIT | Clave de matching para no duplicar |
| `cli_tipo_identificacion` | Tipo de doc. (NIT/CC/etc) | Catálogo propio del portal — mapear código SIESA → id del portal |
| `cli_razon_social` | Razón social | — |
| `cli_direccion` | Dirección | — |
| `cli_correo` | Correo | Solo importa si se habilita acceso al portal |
| `pai_id` / `dpto_id` / `ciu_id` | País/depto/ciudad | SIESA lo maneja como ciudad (`t013_mm_ciudades`) — mapear a catálogos del portal. Ojo con el bug ya conocido del catálogo geográfico propio (`fp_id` 1154/1155/1156) antes de depender de este mapeo |
| `ejng_id` | Ejecutivo de negocio asignado | En SIESA sería el "vendedor" (tercero vendedor) — **candidato confirmado**: `t201_mm_clientes.f201_id_vendedor` (ej. `230`), falta mapear código SIESA → `ejng_id` del portal |
| `sol_co_id` / centro de operación | Centro de operación | En SIESA podría salir de compañía/sucursal — mapear |
| `sol_cupo_aprobado` | Cupo de crédito | **Resuelto**: `t201_mm_clientes.f201_cupo_credito` (ver sección "Progreso confirmado" más abajo) |
| `sol_plazo_pago` | Plazo de pago | **Resuelto (parcial)**: `t201_mm_clientes.f201_id_cond_pago` (código, ej. `08`) — falta mapear a los valores que usa el portal |
| `sol_forma_pago` | Forma de pago | Todavía sin resolver — no se ha visto una columna separada de "forma de pago" en `t201_mm_clientes` |
| `sol_es_zona_franca` | Zona franca | Si SIESA lo distingue |

### NO vienen de SIESA — se generan o se deciden en el portal

| Variable | Qué se hace hoy (cliente/solicitud manual) | Decisión para migración |
|---|---|---|
| `cli_porcentaje_entrega`, `cli_tonelada_objetivo` | Se ponen en 0 | ¿Igual, o SIESA tiene equivalente? |
| `cli_estado_aprobacion` | Se pone `'P'` al crear | Para un cliente ya aprobado probablemente otro valor (ej. `'A'`) — a decidir |
| `cli_estado` | `'A'` | Igual |
| `cli_acceso_portal_clientes` / `cli_password` | Se genera random si se habilita | Pendiente ya anotado arriba: ¿habilitado de una vez o no? |
| `sol_estado_id`/`sol_etapa_actual_id`/`sol_resultado_etapa_id` | — | Fijos: 5 (APROBADA) / CC2 / APROBADO |
| `sol_numero_solicitud` | `sp_ObtenerSiguienteNumeroSolicitud` | Igual, mismo mecanismo que ya usa `ampliacion-cupo` |
| `sol_version`, `sol_formulario_version` | 1 / versión activa del formulario | Igual |
| `sol_fecha_creacion` | `now()` | ¿Fecha de la migración, o la fecha real de aprobación en SIESA si existe? Decidir |
| `sol_origen` (propuesto, no existe aún) | — | Fijo: `'MIGRACION_SIESA'` |

## Pendiente / fuera de alcance de este documento

- Mecanismo real de acceso a SIESA (BD directa vs API vs archivo) — no
  decidido, bloquea empezar a implementar.
- Consulta exacta en SIESA para maestro de cliente + cupo aprobado (no es
  la misma que `1. Consulta de Pedido por Item.sql`, esa es de pedidos).
- Si los clientes recién migrados deben quedar con acceso al portal
  (`cli_acceso_portal_clientes`) habilitado de una vez, o inhabilitado
  hasta que alguien lo active manualmente.
- Nombre y valores exactos de la columna `sol_origen` (o el mecanismo que
  se use para marcar el origen).
