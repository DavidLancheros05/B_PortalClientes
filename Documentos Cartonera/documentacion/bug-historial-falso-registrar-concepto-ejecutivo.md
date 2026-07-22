# Bug: "Historial de Solicitud" mostraba un paso "Concepto" que nunca se había registrado

> Encontrado el 2026-07-21 por el usuario, al abrir la pantalla de registro de concepto del Ejecutivo de Negocios para una solicitud (`sol_id=2187`) que seguía pendiente de contestar.

## Síntoma reportado

En `http://localhost:3000/solicitudes/gestion-ejecutivo-negocios/[id]/registrar`, el panel "Historial de Solicitud" mostraba un paso **"Concepto"** con ✓ (checkmark verde, igual que los pasos ya completados), fecha "21 de jul 12:03 a. m." y usuario "David Ejecutivo" — pese a que el formulario "Registrar Concepto" seguía vacío, sin haberse guardado nada todavía.

Pregunta del usuario: *"por que dice la fecha del ejecutivo si no lo ha contestado?"*

## Causa raíz

**Archivo:** `F_PortalClientes/src/app/solicitudes/gestion-ejecutivo-negocios/[id]/registrar/page.tsx`

A diferencia de las otras pantallas de gestión (Auxiliar Servicio Cliente, Oficial de Cumplimiento, Comité de Crédito 1/2), que cargan el historial real vía `solicitudesService.obtenerHistorialWorkflow(solicitudId)` (`GET /solicitudes/:id/workflow-historial`), esta pantalla **nunca llamaba a ese endpoint**. En su lugar armaba un arreglo `pasos` completamente hardcodeado:

```ts
// ANTES
const pasos = [
  { id: "creada", nombre: "Creada", estado: "completado", fecha: solicitud?.sol_fecha_creacion, usuario: solicitud?.cliente_nombre, ... },
  {
    id: "concepto",
    nombre: "Concepto",
    estado: "en_curso",
    fecha: new Date().toISOString(),      // <- siempre "ahora", sin importar si ya se guardó
    usuario: user?.nombre || user?.email || "-", // <- siempre el usuario logueado en ese momento
    ...
  },
  { id: "comercial", nombre: "Comercial", estado: "pendiente", ... },
  // ...
];
```

El paso "Concepto" quedaba estampado con la fecha/hora exacta en que se **cargó la página**, no con la fecha real en que el ejecutivo guarda el concepto — y con el usuario que tuviera la sesión abierta, así fuera solo mirando la pantalla sin haber tocado nada. Además, `HistorialSolicitud` (el componente que dibuja el panel) pinta el ✓ verde para **todas** las entradas del arreglo por igual, sin distinguir "completado" de "en_curso"/"pendiente" — así que el paso se veía indistinguible de uno ya resuelto.

`diasRespuesta` (los días de SLA por etapa, vía `parametrosService.getDiasRespuesta()`) se usaba únicamente para rellenar un campo `dias` de ese arreglo `pasos` que **`HistorialSolicitud` ni siquiera recibe** — código muerto que quedó de una implementación anterior nunca conectada del todo.

## Fix aplicado

Se reemplazó el arreglo hardcodeado por el mismo patrón que ya usan las demás pantallas de gestión: cargar el historial real de forma independiente (si falla, la página sigue funcionando sin el panel, en vez de romperse entera) y mapearlo tal cual:

```ts
// DESPUÉS
const [historial, setHistorial] = useState<any>(null);
// ...
try {
  const historialData = await solicitudesService.obtenerHistorialWorkflow(solicitudId);
  setHistorial(historialData);
} catch (historialError) {
  setHistorial(null);
}
```

```tsx
<HistorialSolicitud
  historial={(historial?.historial || []).map((item: any, index: number) => ({
    historialId: item.historial_id || item.historialId || index,
    etapaNombre: item.etapa_nombre || item.etapaNombre || "Etapa desconocida",
    resultadoNombre: item.resultado_nombre || item.resultadoNombre,
    estadoNombre: item.estado_nombre || item.estadoNombre,
    fecha: item.fecha,
    usuarioNombre: item.usuarioNombre || item.nombre || item.usuario_nombre,
  }))}
/>
```

Se eliminó el `pasos`/`diasRespuesta`/`parametrosService.getDiasRespuesta()` sin uso real.

## Verificación

- `GET /solicitudes/2187/workflow-historial` confirmado en vivo: solo trae 3 pasos reales (Creación, Cliente → pendiente de documentos, Ejecutivo Negocios → pendiente) — ningún paso "Concepto", que es lo correcto porque todavía no se ha guardado.
- Typecheck del frontend limpio tras el cambio.

## Nota para revisar en otras pantallas

No se auditaron a fondo el resto de pantallas de "gestión"/"registrar" por etapa buscando el mismo patrón de datos hardcodeados — solo se confirmó que Auxiliar Servicio Cliente ya usa el historial real. Si se repite una queja similar en otra etapa (Oficial de Cumplimiento, Comité de Crédito 1/2), revisar primero si esa pantalla arma su propio `pasos`/timeline a mano en vez de consumir `obtenerHistorialWorkflow`.
