# Plan de Sincronización de Tipos - Frontend/Backend

## ✅ Completado

### 1. Auditoría del Backend
- ✅ Revisé qué devuelve realmente cada endpoint
- ✅ Documenté en `TIPOS_API_AUDITORIA.md`

### 2. Archivo Único de Verdad
- ✅ Creé `src/types/api.types.ts` con interfaces correctas
- ✅ Basado en respuestas reales del backend
- ✅ Interfaces:
  - `ClienteResponse`
  - `ClienteCentroResponse` (mapeo especial: id, nombre)
  - `CentroOperacionResponse` (directo: cop_id, cop_nombre)
  - `RolResponse`
  - `CorreoPorRolResponse`
  - `TipoIdentificacionResponse`

### 3. Actualización de Servicios
- ✅ `clientes.service.ts` - ahora usa `ClienteResponse`
- ✅ `correos-rol.service.ts` - ahora usa `CorreoPorRolResponse`, `RolResponse`
- ✅ `centros-operacion.service.ts` - ahora usa `CentroOperacionResponse`
- ✅ Aliased old types como `@deprecated` para compatibilidad

### 4. Actualización de Componentes (2026-08-02)
- ✅ `editar/page.tsx` - `clienteData` ya usaba `ClienteDetailResponse` vía el
  servicio; se quitaron los `: any` sueltos en los `.map()` de centros y
  ejecutivos, y `tiposData` pasó a tipar `TipoIdentificacionResponse[]`
- ✅ `nuevo/page.tsx` - se quitó el `c: any` del `.map()` de centros
- ✅ `correos-por-rol/page.tsx` - se eliminaron los tipos locales `RolBasico`/
  `CorreoPorRol` y se importan `RolResponse`/`CorreoPorRolResponse` de
  `api.types.ts`
- `tsc --noEmit` sigue en 0 errores tras el cambio

### 5. formulario-editor/hooks/usePreguntaEditor.ts (2026-08-02)
- Causa raíz real: no era que el union fuera "muy amplio", sino que estaba
  **incompleto e inconsistente entre dos copias**. `hooks/types.ts::Pregunta["fp_tipo"]`
  no incluía `SELECT_CONDICIONAL` (sí usado en preguntas reales — ver
  `PreguntaRenderer.tsx`) y `api.types.ts::FormularioPreguntaResponse["fp_tipo"]`
  no incluía `ESPACIO_FIRMA`. El enum real del backend
  (`BACKEND/src/parametrizacion/formulario-preguntas/entities/formulario-pregunta.entity.ts::TipoPregunta`)
  sí tiene los 14 valores. Se completaron ambos unions (+ el label que le
  faltaba a `SELECT_CONDICIONAL` en `tipo-labels.ts`, exhaustivo por `Record`).
- Aparte, `Array.prototype.includes()` en TS exige que el argumento sea
  asignable al tipo *inferido del array literal* (el de los literales
  listados), no al tipo completo de la variable — de ahí los `as any` en cada
  `[TIPOS_PREGUNTA.X, ...].includes(valorDelUnionCompleto)`. Se resolvió
  declarando los conjuntos reutilizados como constantes tipadas explícitamente
  `Pregunta["fp_tipo"][]` (`TIPOS_CON_OPCIONES_FIJAS`, `TIPOS_CATALOGO_DOCUMENTOS`,
  `TIPOS_SIN_REQUERIDA`, `TIPOS_CON_SINCRONIZACION_OPCIONES`,
  `TIPOS_SELECT_MULTISELECT`) en vez de castear cada comparación.
- Los `} as any)` sueltos en los payloads de `formularioPreguntasService.update()`
  no hacían falta — el `Partial<FormularioPregunta>` del servicio ya aceptaba
  esos campos sin cast.
- Las 14 ocurrencias de `as any` quedaron en 0. `tsc --noEmit` sigue en 0
  errores.

## Nota Sobre Transformaciones

**CentroOperacionResponse** devuelve `cop_id` y `cop_nombre`, pero los componentes esperan `id` y `nombre`:

```typescript
// En el componente:
const centros = Array.isArray(centrosData)
  ? centrosData.map((c: CentroOperacionResponse) => ({
      id: c.cop_id,
      nombre: c.cop_nombre,
    }))
  : [];
```

**EXCEPTO** `GET /clientes/:id/centros-operacion` que ya mapea correctamente a `{ id, nombre }`.

## Próximos Pasos

1. Compilar y verificar que los servicios corrijan los errores
2. Actualizar componentes para importar de `api.types.ts`
3. Considerar refactoring de tipos de preguntas si hay tiempo
