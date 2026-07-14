# Flujo — Auxiliar de Servicio al Cliente (ASC)

Qué hace este rol en el flujo de aprobación de una solicitud, verificado en el código real.

- **Etapa de entrada:** ASC
- **Etapa de salida:** OFC (si aprueba) — se queda en ASC (si rechaza)
- **Decisión:** aprueba o rechaza (a diferencia del Ejecutivo, aquí sí hay una decisión real)

## Pasos

- [ ] **1. La solicitud entra a tu cola**
      Llega automáticamente cuando el Ejecutivo de Negocios guarda su concepto. A diferencia del Ejecutivo (que solo ve las solicitudes de sus clientes asignados), **ASC es una cola compartida**: cualquier usuario con rol ASC ve todas las solicitudes pendientes del sistema, sin importar el centro de operación o quién las está gestionando.
      Pantalla: **Gestión Auxiliar de Servicio al Cliente** (listado).

- [ ] **2. Revisar la solicitud**
      Entra a **"Gestionar"** para ver los datos de la solicitud, los documentos requeridos y los motivos de rechazo disponibles.

- [ ] **3. Decidir: Aprobar o Rechazar**
  - **Aprobar:** no pide nada más.
  - **Rechazar:** exige elegir **Motivo del Rechazo** y **Modo de Solución** ("Cliente Actualiza" / "Auxiliar Actualiza"). Si el motivo es "documentos con fecha de emisión incorrecta", además aparece un checklist para marcar cuáles documentos están mal.

- [ ] **4. Guardar la decisión**
      Botón que envía `aprobado`, `motivo_rechazo_id` y la fecha estimada de respuesta comercial.

- [ ] **5. Qué sigue**
  - **Aprobada:** pasa a **Oficial de Cumplimiento (OFC)**, estado Revisión. No se notifica a nadie de este paso.
  - **Rechazada:** el cliente recibe un correo pidiendo corregir documentos. La solicitud vuelve a aparecer en la cola compartida de ASC para revisarla de nuevo cuando el cliente actualice.

## Notas técnicas (hallazgos, ninguno corregido todavía)

- **Sin guard de rol**: el endpoint (`PUT /solicitudes/:id/aprobacion`) solo exige JWT válido — cualquier rol autenticado (cliente, ejecutivo, oficial de cumplimiento, comité de crédito) puede aprobar o rechazar una solicitud. Mismo tipo de problema que tenía Ejecutivo antes del fix; aquí sigue pendiente.
- **Sin validación de etapa**: se puede aprobar/rechazar una solicitud que ni siquiera está en etapa ASC (por ejemplo, una que ya está en Oficial de Cumplimiento).
- **"Modo de Solución" no llega al backend**: la pantalla lo exige como obligatorio, pero nunca se envía en la petición. Resultado: la opción "Auxiliar Actualiza" no hace nada — todo rechazo se comporta igual que "Cliente Actualiza".
- **El checklist de "documentos con fecha incorrecta" no se guarda en ningún lado** — no existe columna ni parámetro en el backend para recibirlo. Es una casilla que el usuario marca y no queda registrada.
- **Bug real de datos**: cada vez que ASC aprueba o rechaza, se borra la fecha estimada de respuesta comercial (queda en `NULL`) porque el frontend lee el campo con un nombre que no coincide con lo que devuelve el backend. Esto pisa silenciosamente un dato que el Ejecutivo ya había registrado.
- Un campo (`fecha_real_respuesta_comercial`) se envía desde la pantalla pero el backend nunca lo usa — dato muerto.
- Existe un endpoint separado (`PUT /solicitudes/:id/concepto-servicio-cliente`) que el frontend **nunca llama** — código muerto. Además, tal como está escrito, jamás podría usarse para rechazar (siempre aprueba).
- El código de rol `ASC` (en el catálogo de roles) y el código de etapa `ASC` (en el catálogo de etapas del workflow) son el mismo texto pero viven en tablas distintas — hoy no se mezclan en ningún lado, pero vale la pena tenerlo presente si alguien agrega el guard de rol pendiente, para no confundir uno con otro.
