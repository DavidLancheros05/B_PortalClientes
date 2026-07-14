# Qué consume tokens/tiempo de más en este proyecto, y cómo evitarlo

Este archivo se actualiza cada vez que se detecta un patrón que costó tokens o
tiempo de forma evitable en una sesión de trabajo con Claude Code. El
objetivo es que la siguiente sesión lea esto (vía `CLAUDE.md`) y no tenga que
volver a pagar el mismo costo.

## 1. Reescribir el boilerplate de conexión a la BD en cada verificación

**Costo**: cada vez que había que consultar la base de datos en vivo (que fue
muchas veces en una sola sesión), se escribía un script Node inline de ~20
líneas repitiendo: parseo manual de `.env`, config de `mssql`, conectar,
consultar, cerrar. Eso son tokens de salida + una llamada a Bash por cada
consulta, para código que es casi idéntico cada vez.

**Fix**: ahora existen `BACKEND/scripts/db-query.mjs` y
`BACKEND/scripts/mint-jwt.mjs`. Usarlos en vez de reescribir el boilerplate:

```bash
cd BACKEND
node scripts/db-query.mjs "SELECT TOP 5 * FROM solicitudes"
node scripts/db-query.mjs migrations/20260712_algo.sql   # también acepta un archivo .sql
node scripts/mint-jwt.mjs ADMIN
node scripts/mint-jwt.mjs CLIENTE 13603                  # segundo argumento = cliente_id
```

## 2. Reiniciar el backend a ciegas, en varias rondas de espera cortas

**Costo**: `nest start --watch` no siempre recarga el proceso al guardar un
archivo — a veces revienta con `EADDRINUSE` porque intenta matar el proceso
viejo y falla (ver detalle en `CLAUDE.md`). Cuando pasó, se perdieron varios
ciclos de "esperar 60-75s, revisar netstat, seguir esperando" antes de notar
que había que matar el proceso a mano y relanzar. Cada ronda de esperar +
revisar es una llamada a `ScheduleWakeup` + `Bash` que se pudo evitar.

**Fix / receta directa** (no ir por partes): después de editar código del
backend, si en ~90s no responde `GET http://localhost:3001/api/solicitudes`
(o el endpoint que sea), asumir que el watcher se cayó y hacer esto de una
sola vez, sin rondas intermedias de espera:

```bash
PID=$(netstat -ano | grep LISTENING | grep ':3001' | awk '{print $5}' | head -1)
[ -n "$PID" ] && taskkill //F //PID $PID
cd BACKEND && npm run start:dev   # run_in_background: true
# Nest tarda ~60-90s en compilar + levantar. Un solo ScheduleWakeup de 90s
# suele bastar — no hace falta chequear a los 30s "por si acaso".
```

## 3. Volver a explorar la arquitectura del proyecto desde cero

**Costo**: antes de que existiera `CLAUDE.md` en la raíz del proyecto, cada
sesión nueva (y cada compactación de contexto dentro de la misma sesión)
implicaba releer archivos para entender: qué módulos usan SQL crudo vs
TypeORM, los prefijos de columnas, la máquina de estados del workflow, los
tres sistemas de PDF distintos, etc.

**Fix**: ya existe `PROYECTO/CLAUDE.md` con todo eso resumido, se carga
automáticamente. Si en una sesión futura hace falta volver a investigar algo
que ya está ahí, es que `CLAUDE.md` quedó desactualizado — corregirlo ahí
directamente en vez de solo resolverlo puntualmente.

## 4. Sesiones muy largas y multi-feature en un solo chat

**Costo**: esta sesión encadenó ~8 tareas grandes distintas (rename de
columnas, Cloudinary, rediseño de Mis Documentos, ocultar
secciones/preguntas, tipo de plantilla, fix de lentitud, etc.) sin cortar.
El historial creció tanto que el sistema tuvo que comprimirlo una vez a
mitad de sesión, lo que en sí mismo cuesta tokens (generar el resumen) y
riesgo de perder detalle fino.

**Mitigación práctica**: no es algo que se arregle con un archivo, pero vale
la pena que el usuario sepa que separar trabajo no relacionado en chats
distintos (uno por feature/bug) evita ese costo de compactación. Si una
sesión ya se nota muy larga y el siguiente pedido no depende del contexto
inmediato anterior, puede convenir empezar un chat nuevo — `CLAUDE.md` y esta
misma nota se recargan igual.

## 5. Probar el frontend con Playwright en rutas que requieren rol CLIENTE

**Costo**: hubo intentos de tomar capturas con Playwright autenticando como
CLIENTE (vía `localStorage`) que terminaron en un redirect a `/login` no
resuelto, sin lograr la captura — tiempo y tokens gastados sin resultado.

**Fix**: documentado en `CLAUDE.md` como gotcha conocido. Con rol ADMIN
Playwright sí funciona bien. Para flujos de CLIENTE, es más barato verificar
por API directa (con `mint-jwt.mjs CLIENTE <id>` + `curl`) que por captura de
pantalla, salvo que el pedido sea explícitamente visual/CSS.

## 6. Esperar builds externos (Vercel/Render) con rondas cortas de `ScheduleWakeup`

**Costo**: para confirmar que un redeploy de Vercel había tomado una variable
de entorno nueva, se progrmaron 3 rondas de `ScheduleWakeup` de 3 minutos
cada una, reintentando `curl` cada vez. Cada wakeup recarga la conversación
completa — no es gratis — y el build tardó más de esas 3 rondas de todos
modos.

**Fix**: para un build/deploy externo cuya duración no se controla, es más
barato pedirle al usuario que avise cuando el estado cambie a "Ready" (o
pegue el resultado) que hacer polling. Si se necesita esperar sin intervención
del usuario, una sola espera más larga (p. ej. 5-6 min) vale más que 3
rondas cortas de "a ver si ya".

## Top 5 mayores gastos de la sesión del 2026-07-12 (estimado)

**Metodología / aviso**: no existe una herramienta de conteo exacto de tokens
por llamada en este entorno. Esto es una estimación razonada a partir del
tamaño de los archivos/salidas involucradas y de cuántas veces se repitieron.
Un solo dato es exacto (el #1, medido por el propio sistema); el resto son
órdenes de magnitud, no cifras precisas. Sirve para priorizar qué evitar, no
como factura.

| # | Causa | Estimado | Por qué |
|---|---|---|---|
| 1 | Leer el log completo de arranque de Nest (`b0pdgx4gc.output`) para diagnosticar por qué el backend no levantaba | **~25.000 tokens** (medido: el archivo completo eran 69.410 tokens, el sistema lo truncó a un tope de 25.000 en esa sola llamada) | El log de `nest start --watch` imprime una línea por cada ruta mapeada (200+ rutas) más todo el árbol de módulos cargados — pedí el archivo completo con `Read` en vez de ir directo al error con `Grep`/`tail`. Corregido a mitad de sesión: las siguientes veces usé `tail -c N`. |
| 2 | El resumen de continuación que abre esta conversación (bloque "This session is being continued...", secciones 1–9) | **~6.000–9.000 tokens**, y a diferencia de los demás, **se reenvía en cada turno posterior** (no es costo de una sola vez) | La sesión anterior encadenó ~8 tareas grandes sin cortar, así que el sistema tuvo que comprimir todo el historial en un resumen denso para poder seguir. Ver punto 4 más abajo (mitigación: cortar en chats más chicos). |
| 3 | Lecturas repetidas y parcialmente superpuestas de `mis-documentos/page.tsx` (716 líneas) a lo largo de 3 tareas distintas (botones de plantilla, rediseño de "documentos diferidos", fix de lentitud) | **~9.000–10.000 tokens acumulados** | Cada tarea nueva sobre el mismo archivo grande volvió a leer bloques ya vistos en vez de operar solo sobre las líneas relevantes (identificadas por `Grep` primero). |
| 4 | Lecturas repetidas de `solicitudes.controller.ts` en ventanas superpuestas (líneas 1–60, 356–410, 395–460, 450–470) durante los cambios de `representante-legal` y `documentosDiferidos` | **~2.500–3.500 tokens acumulados** | Mismo patrón que el punto 3, en un archivo más chico. |
| 5 | Ciclos de reinicio del backend con espera (4 veces: prueba inicial, caída por `EADDRINUSE`, caída tras el rename de `documentosDiferidos`) | **~1.500–2.500 tokens acumulados**, repartidos en muchas llamadas chicas | No es un bloque grande de texto sino muchas idas y vueltas cortas (`netstat`, `taskkill`, `ScheduleWakeup`, releer el log) — el costo real ahí es más de *tiempo* (varios minutos de espera) que de tokens. Ver punto 2 de la lista de arriba para la receta que ya lo evita. |

**Lectura general**: el costo más grande y más evitable de la sesión fue #1
(un solo `Read` mal dirigido). El #2 es estructural (consecuencia de una
sesión larga, no de una decisión puntual). Los puntos #3 y #4 son el mismo
patrón — releer un archivo grande en vez de ir directo a la sección relevante
— y ya están mitigados en la práctica por tener `CLAUDE.md` como mapa del
proyecto, que reduce cuánto hace falta releer para orientarse.

### Cómo evitar cada uno la próxima vez (regla concreta)

1. **Logs grandes (`.log`/`.output`, salidas de `nest start --watch`, etc.)**:
   nunca `Read` completo sin `offset`/`limit`. Primero `Grep` con un patrón
   como `Error|EADDRINUSE|ERROR` sobre el archivo, o `tail -c 2000-4000` por
   Bash — casi siempre lo que hace falta está en las últimas 50-100 líneas,
   no en las 700 de mapeo de rutas. Solo pedir más contexto con `Read` si el
   `Grep`/`tail` no alcanza.
2. **Resumen de continuación / sesiones largas**: cuando una tarea nueva no
   depende del contexto inmediato anterior (ej. "ahora quiero trabajar en X",
   sin relación con lo último hecho) y la sesión ya lleva varias tareas
   grandes completadas, conviene abrir un chat nuevo en vez de seguir en el
   mismo. `CLAUDE.md` y este archivo se cargan igual en la sesión nueva, así
   que no se pierde contexto de arquitectura — solo se evita cargar el
   historial completo de tareas ya terminadas.
3. y 4. **Releer archivos grandes ya vistos en la misma sesión**: antes de un
   `Read` de un archivo grande, revisar si ya se leyó antes en la conversación
   (el sistema avisa "file state is current in context — no need to Read it
   back" tras cada `Edit`/`Write`). Si hace falta ubicar una sección
   específica para editar, usar `Grep` con el nombre de la función/variable
   primero y pedir `Read` solo con `offset`/`limit` acotado a esa zona, no el
   archivo entero "por si acaso".
5. **Reinicios del backend**: seguir al pie de la letra la receta de un solo
   paso del punto 2 más arriba (matar PID + relanzar + un único
   `ScheduleWakeup` de 90s) — no volver a chequear `netstat` a los 20-30s
   "para ver si ya está", eso es lo que multiplica las idas y vueltas.
