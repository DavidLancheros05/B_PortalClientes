# Flujo — Ejecutivo de Negocios

Qué hace este rol en el flujo de aprobación de una solicitud, verificado en el código real.

- **Etapa de entrada:** EJN
- **Etapa de salida:** ASC (Auxiliar de Servicio al Cliente)
- **Decisión:** solo registra concepto, no aprueba/rechaza

## Pasos

- [ ] **1. La solicitud entra a tu bandeja**
      Se asigna automáticamente al ejecutivo del cliente (`sol_ejecutivo_id`, heredado del cliente al crear la solicitud) — no es un pool compartido, solo ves las solicitudes de tus clientes. Si tu usuario tiene rol "Ejecutivo" activo y correo, te llega un aviso por email cuando se crea.
      Pantalla: **Gestión Ejecutivo de Negocios** (listado filtrado por tu usuario, estado Pendiente).

- [ ] **2. Revisar lo que envió el cliente**
      Desde el listado, entra a **"Ver"** para revisar respuestas y documentos del cliente (RUT, certificado de existencia, estados financieros, etc.). La pantalla de "Registrar concepto" (paso 4) **no muestra** el formulario ni los documentos — es una pantalla aparte.

- [ ] **3. Completar tu concepto comercial**
      En **"Registrar concepto"**, diligencia:
  - **Consumo mensual proyectado** (obligatorio)
  - **Observaciones** (obligatorio)
    El botón "Guardar Concepto" queda deshabilitado hasta llenar ambos.

- [ ] **4. Guardar Concepto**
      No hay opción de rechazo en este paso — solo registra y avanza. Al guardar:
  - Se guarda: consumo proyectado, observaciones, fecha de gestión.
  - Estado resultante: **Revisión**, etapa **ASC**, resultado **Pendiente**.

- [ ] **5. Sale de tu bandeja**
      Desaparece de tu listado de pendientes. Pasa a revisión del **Auxiliar de Servicio al Cliente**; no vuelves a intervenir salvo reasignación.

## Notas técnicas (no afectan el uso normal)

- `Observaciones` solo se valida como obligatorio en el frontend; el backend no lo rechaza si llega vacío por otra vía (`PUT /solicitudes/:id/concepto-ejecutivo`).
- ~~Al guardar, el sistema actualizaba el estado de la solicitud dos veces seguidas con el mismo resultado~~ — **corregido**: se quitó la llamada redundante a `actualizarEstadoFlujoAutomatico` en el controller, `guardarGestionEjecutivo` ya deja el estado correcto por sí solo.
- ~~El endpoint no verifica que la solicitud esté en la etapa "Ejecutivo" antes de aceptar el guardado, ni restringe el acceso por rol específico~~ — **corregido**: ahora exige rol `EJECUTIVO` o `ADMIN` (`RolesGuard` + `@Roles`), y valida que la solicitud esté realmente en etapa `EJN` antes de guardar (si no, responde con un error claro en vez de mover el flujo igual).
- El Auxiliar de Servicio al Cliente no recibe notificación automática cuando el ejecutivo termina su parte — solo se notifica al ejecutivo cuando la solicitud se crea.
