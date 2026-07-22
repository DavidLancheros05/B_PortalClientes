# Análisis global — por qué el plan de permisos no vio lo que ya existía, y qué más hay suelto

Fecha: 2026-07-23. Motivado por una pregunta directa del usuario: se armó un
plan y una implementación completa para "dónde coloco el permiso de eliminar
solicitudes" sin detectar que **ya existía una pantalla (`/seguridad/roles`)
construida exactamente para eso** — y que estaba rota.

## 1. Por qué el plan anterior no lo vio (autocrítica)

El plan de la sesión anterior (`ModulePermissionGuard` + `tienePermiso` +
`@RequierePermiso`) se diseñó explorando **solo el lado de datos y backend**:
tablas `pc_roles`/`pc_modulos`/`pc_rol_modulo`, `PermissionsService`,
`RolesGuard`. Nunca se hizo la pregunta obvia en retrospectiva: *"¿ya existe
una pantalla de frontend para editar esto?"* — porque la tarea que disparó el
plan era "conectar `deleteSolicitud` a un permiso", no "construir la
administración de permisos". El error de proceso concreto:

- Se exploró `B_PortalClientes/src/permissions/` y las tablas `pc_*` a fondo.
- **No se exploró `F_PortalClientes/src/app/seguridad/**`** ni se hizo
  `grep` de `pc_rol_modulo`/`rol_modulo` del lado del frontend antes de
  diseñar la infraestructura nueva.
- `Todas.md` (este mismo directorio) ya tenía la pista, generado el
  2026-07-18, en su nota final: *"El dominio de roles/módulos está expuesto
  por tres superficies distintas... probablemente por evolución histórica
  del código"* — no se releyó esa nota al planear.

**Lección de proceso**: antes de proponer infraestructura nueva para "gestionar
X", buscar primero páginas/hooks/servicios de frontend ya existentes con
nombres relacionados (`grep -ri` del concepto en ambos repos, no solo el que
se está tocando), y releer la documentación de `Funcionalidades/` si el tema
ya aparece ahí.

## 2. El hallazgo concreto: el dominio Roles/Módulos/Permisos está triplicado

### Backend — tres controllers para lo mismo

| Ruta real | Archivo | Estado |
|---|---|---|
| `GET /roles`, `GET /roles/:id` | `src/roles/roles.controller.ts` | **Vivo**, registrado en `app.module.ts`. Solo lectura, lo usa el dropdown simple de `usuario-roles`. |
| `GET/POST/PUT/DELETE /seguridad/roles`, `GET /seguridad/modulos` | `src/seguridad/seguridad.controller.ts` | **Vivo**, registrado. CRUD completo de roles + árbol de módulos con permisos (`pc_rol_modulo`). Es el que usa `/seguridad/roles` del frontend. |
| `@Controller('api/seguridad/roles')` con `POST/GET/PUT/DELETE` + `.../modules` | `src/modules/seguridad/roles/roles.controller.ts` | **Muerto** — no está en `app.module.ts`, nadie lo importa. Además tiene un bug propio: declara el prefijo `api/seguridad/roles` a mano, que con el prefijo global `api` (`main.ts`) quedaría en `/api/api/seguridad/roles` si algún día se registrara. |

### Frontend — tres intentos de UI para lo mismo

| Página/componente | Estado antes de esta sesión |
|---|---|
| `src/app/seguridad/roles/page.tsx` + `rolModal.tsx` | **Vivo y visible en el menú**, con un árbol completo de módulos y checkboxes Ver/Crear/Editar/Eliminar/Aprobar — pero **el guardado no funcionaba**: `rolesService.create()`/`.update()` (`src/services/seguridad/roles.service.ts`) ni siquiera aceptaban `modulos` como parámetro, así que cualquier cambio de permisos se descartaba en silencio al guardar. Arreglado en esta sesión (ver `#3`). |
| `src/components/seguridad/RolesManager.tsx` (+ hook `src/hooks/useRoles.ts`) | **Código muerto** — no lo importa ninguna página (`grep` confirma que el único archivo que menciona `RolesManager` es él mismo). Llama a `rolesService.assignModule`/`.removeModule`/`.getModulesByRole`, que apuntan a `/seguridad/roles/:id/modules`, endpoint que **no existe** en el controller vivo (solo existía en el controller muerto de la tabla anterior). Si alguien llega a montar este componente, todas sus llamadas devuelven 404. |
| `src/app/seguridad/permisos-por-pagina/page.tsx` | Vivo, funciona — pero es **solo lectura** (matriz rol × página), consume el mismo `GET /seguridad/roles` que ya funcionaba. No es redundante, es un visor legítimo. |

### Conclusión

No hay tres implementaciones completas compitiendo — hay **una viva pero con
el guardado de permisos roto** (ahora arreglado), **una completamente muerta
en el backend**, y **una completamente huérfana en el frontend** que le
apunta a la muerta. `permisos-por-pagina` es el único "extra" que sí suma
valor real (una vista distinta de los mismos datos).

## 3. Qué se arregló esta sesión (relacionado con este hallazgo)

1. `rolesService.create()`/`.update()` ahora aceptan y envían `modulos` —
   `src/services/seguridad/roles.service.ts`.
2. `roles/page.tsx` ahora pasa `rolData.modulos` al guardar (antes se perdía).
3. Se conectó `deleteSolicitud` (borrado de una solicitud completa, con
   cascada a documentos e historial) a `pc_rol_modulo` vía
   `PermissionsService.tienePermiso('/solicitudes', 'eliminar')` en vez de un
   `rol === 'ADMIN'` quemado en código — ahora administrable desde
   `/seguridad/roles` (única excepción: CLIENTE nunca pasa por este permiso
   genérico, siempre queda limitado a dueño+borrador por regla de negocio
   aparte, para que activar el flag por error no le dé poder de borrar
   cualquier solicitud).
4. Antes de conectar el punto 3, se reseteó `rm_eliminar` a `false` para
   ASC/CC2/EJECUTIVO/OC en el módulo Solicitudes — tenían `true` heredado de
   datos nunca curados para esta acción específica (verificado que nada del
   frontend leía ese flag hasta ahora, así que el reset no rompió nada
   visible).
5. Verificado en vivo de punta a punta con datos descartables: otorgar el
   permiso vía el mismo método que ahora usa la página (`actualizarRol`)
   efectivamente habilita `tienePermiso`, y revertirlo lo vuelve a bloquear.

No se tocó `src/roles/` (sigue siendo el dropdown simple, cumple su función) ni
se borró el código muerto (`src/modules/seguridad/roles/`, `RolesManager.tsx`,
`useRoles.ts`) — ver recomendaciones abajo.

## 4. Otros hallazgos sueltos de esta sesión (deuda técnica, no todos arreglados)

Encontrados de paso mientras se investigaban otras cosas — documentados acá
para que no se vuelvan a "redescubrir" de casualidad:

- **`'ADMINISTRACION'` es un string fantasma**: aparece en varios lugares
  como si fuera un rol válido (`jwt-auth.guard.ts` en su lista
  `rolesPermitidos`, `consecutivos.controller.ts` en varios `@Roles(...)`),
  pero **no existe ningún rol con ese código en `pc_roles`** (los reales son
  8: `ADMIN, CLIENTE, EJECUTIVO, COMERCIAL, ASC, OC, CC1, CC2`). Esas
  comparaciones nunca hacen match — no rompen nada porque son condiciones
  adicionales permisivas (`rol === 'ADMIN' || rol === 'ADMINISTRACION'`), pero
  es código muerto que confunde. **No se tocó** fuera de
  `deleteSolicitud`, donde sí se corrigió.
- **Resolución de rol inconsistente entre los dos flujos de login**:
  `AuthService.loginUsuarioInterno()` sí es multi-rol-aware (usa
  `pc_usuario_rol`) para armar el menú, pero el campo `rol` que va al JWT es
  un único código tomado de la primera fila que devuelva el `JOIN` (arbitrario
  si el usuario tiene más de un rol activo). `AuthService.login()` (el otro
  flujo) usa `user.rol_id` directo, asumiendo una sola columna de rol. No se
  profundizó en cuál de los dos flujos es el que realmente usa el login
  actual del portal ni si esto causa bugs reales — queda como sospecha sin
  confirmar.
- **`solicitudes.sol_id` no tenía `PRIMARY KEY`** (era `IDENTITY` pero sin
  llave) — descubierto al intentar agregar FKs con cascada. Corregido
  (migración `20260722_fk_cascade_tablas_hijas_solicitudes.sql`).
- **~1250 filas huérfanas** acumuladas en `Formulario_respuesta`,
  `Solicitud_archivo`, `solicitud_workflow_historial`,
  `Solicitudes_estados_hist` (de solicitudes de prueba borradas manualmente
  en el pasado, sin FK que lo impidiera). Limpiadas en la misma migración.
- **`deleteSolicitud` (versión original, ya corregida)** usaba nombres de
  columna que no existen en `solicitudes` (`sa_sol_id`, `numero_solicitud`,
  `estado_id` en vez de `sol_id`, `sol_numero_solicitud`, `sol_estado_id`) —
  la función nunca había funcionado en producción, fallaba con "Invalid
  column name" en cualquier intento.
- **Botón "Eliminar" del cliente comparaba contra el estado equivocado**
  (`sol_estado_id === 5`, que es *Aprobada*, no *Borrador* — el real es `1`,
  ver `FLUJO_ETAPAS.md`). Corregido.

## 5. Recomendación

No se hizo en esta sesión (fuera de alcance de lo pedido) pero vale la pena
como tarea aparte:

1. **Borrar el código muerto** en vez de dejarlo dando vueltas:
   `src/modules/seguridad/roles/*` (backend) y `RolesManager.tsx` +
   `useRoles.ts` (frontend) — o si alguno tenía una idea de diseño mejor que
   el vivo (ej. endpoints granulares `POST/DELETE .../modules` en vez de
   mandar el árbol completo), migrar esa idea al controller vivo y recién
   ahí borrar el resto.
2. **Auditar el string `'ADMINISTRACION'`** en `jwt-auth.guard.ts` y
   `consecutivos.controller.ts` — decidir si hace falta un rol real con ese
   código o si es basura de una refactorización vieja.
3. **Confirmar cuál flujo de login es el vigente** (`login()` vs
   `loginWithAccessType`/`loginUsuarioInterno()`) y si la inconsistencia de
   resolución de rol multi-usuario es un bug real o código muerto también.
4. Repetir este mismo ejercicio de "¿ya existe algo a medio construir para
   esto?" — grep de frontend + backend + relectura de `Funcionalidades/` —
   como paso obligatorio antes de cualquier plan que diga "vamos a construir
   una pantalla/infraestructura para X", no solo para permisos.
