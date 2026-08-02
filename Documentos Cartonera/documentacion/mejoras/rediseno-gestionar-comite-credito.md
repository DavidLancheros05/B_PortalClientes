# Rediseño de las pantallas "gestionar" de Comité de Crédito 1/2 y Oficial de Cumplimiento

## Contexto

Distinto del rediseño de los **listados** de gestión (ver
[`rediseno-listados-gestion.md`](rediseno-listados-gestion.md)), esto cubre
las pantallas de **detalle/acción** donde el funcionario realmente registra
su concepto sobre una solicitud puntual:

- `FRONTEND/src/app/solicitudes/gestion-comite-credito-1/[id]/gestionar/page.tsx`
- `FRONTEND/src/app/solicitudes/gestion-comite-credito-2/[id]/gestionar/page.tsx`
- `FRONTEND/src/app/solicitudes/gestion-oficial-de-cumplimiento/[id]/gestionar/page.tsx`
  (ya venía con este sistema visual antes de esta sesión — se usó como
  referencia para las otras dos).

Hecho el 2026-07-27. Vive solo en local, falta commit/push.

## Patrón visual aplicado (igual en las 3 páginas)

- Tarjeta única `border-radius: 22px`, sombra suave
  (`0 20px 50px rgba(15,23,42,0.06)`), sobre fondo de página
  `linear-gradient(180deg,#f6f8fc,#eef1f7)` — reemplaza el
  `bg-white/70 backdrop-blur-sm` + `max-w-[90%]` anterior.
- Header con gradiente `linear-gradient(120deg,#003d99,#0050c7)`: botón
  volver en chip translúcido, ícono en chip, título + número de solicitud.
- Bloque de info: grid de 3 columnas (Cliente / Centro de operación / Estado
  con pill de color por `ESTADO_TOKENS`), seguido de un grid de 2 columnas
  simétrico (`lg:grid-cols-2 items-stretch`) con "Solicita cupo de crédito"
  (verde, dato accionable) y "Concepto del ejecutivo de negocios" (azul,
  igual tratamiento que los demás conceptos narrativos de solo lectura).
- Conceptos de etapas previas (ej. OFC y CC1 dentro de la pantalla de CC2):
  mismo azul (`bg-[#eff6ff]`, `border-[#dbeafe]`, título `#1d4ed8`) que
  "Concepto del ejecutivo", en grid de 2 columnas con `flex flex-col h-full`
  y el bloque de comentario en `flex-1`, para que ambas tarjetas terminen a
  la misma altura sin importar cuál comentario es más largo.
- Cuerpo en 2 columnas: formulario de la gestión (flexible) + historial
  (`300px`, columna fija) vía `grid-cols-[1fr_300px]`.
- Botón primario con `box-shadow: 0 6px 16px rgba(0,61,153,0.22)` y hover
  `translateY(-1px)`; botón "Cancelar" outline.

## Feedback al usuario: probamos Toast, se revirtió a modales bloqueantes

Esta parte cambió de dirección durante la sesión, vale la pena dejar
constancia del porqué:

1. **Primer intento**: reemplazar el `SuccessModal` bloqueante (había que
   hacer clic en "Aceptar") por un toast no bloqueante
   (`src/components/Toast.tsx`: fondo `#0f172a`, ícono check verde,
   auto-dismiss ~2.6s), con `ConfirmModal` reservado solo para la
   confirmación previa al envío. Se aplicó a las 3 páginas.
2. **Se revirtió a pedido explícito del usuario** ("quiero que salga el
   modal de éxito") — las 3 páginas volvieron a `SuccessModal` (bloqueante,
   con botón "Aceptar", `autoClose` a los 3s) tras confirmar el guardado.
   `Toast`/`useToast` quedaron sin usar en estas 3 páginas (el componente
   sigue existiendo en `src/components/Toast.tsx` por si se necesita en
   otro lado).
3. **De paso se corrigió el manejo de errores al guardar**: las 3 páginas
   usaban `alert()` nativo del navegador si `guardarConcepto*` fallaba —
   inconsistente con el resto del sistema de modales. Se reemplazó por
   `ErrorModal` (mismo componente de `@/components/modals`, ya existía en
   `ModalesGenericos.tsx` pero no se estaba usando en ninguna de estas 3
   páginas), con estado `errorMessage` propio por página.

**Patrón final de las 3 páginas**: `ConfirmModal` (confirmación previa,
irreversible) → `SuccessModal` (éxito, autoClose 3s, redirige al listado de
esa gestión) → `ErrorModal` (si falla el guardado, en vez de `alert()`).

### Nota sobre `GUIA_MODALES.md`

Ese documento (más viejo, sin fecha) todavía recomienda "error → ConfirmModal
con `isDangerous=true`" y no menciona `ErrorModal` en absoluto, aunque el
componente ya existe en `ModalesGenericos.tsx` junto a `ConfirmModal`/
`SuccessModal`/`LoadingModal`/`WarningModal`/`InfoModal`. Las 3 páginas de
este documento usan `ErrorModal` directo, no el patrón viejo de la guía —
si se retoma `GUIA_MODALES.md`, actualizarlo para que coincida.

## Otro hallazgo de esta sesión, sin relación visual: soportes de Comité de Crédito 1

Al revisar por qué "Soportes de Comité de Crédito 1" siempre aparece vacío
en la pantalla de CC2: **no es un bug de datos**, es que la pantalla de
gestión de CC1 nunca tuvo un `SoportesAnalisis` sin `readOnly` — en toda la
tabla `Solicitud_soporte_analisis` no hay ni un solo registro con
`ssa_wet_id=5` (CC1), solo con `ssa_wet_id=4` (Oficial de Cumplimiento, que
sí tiene el uploader en su propia página). Confirmado por consulta directa a
la BD. Pendiente decidir si se le agrega el uploader a CC1 (no se hizo en
esta sesión).
