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

## 🔄 Pendiente

### Actualizar Componentes
Los componentes siguen usando tipos locales. Necesitan actualizar:

1. **editar/page.tsx** - Cambiar de tipos locales a `ClienteResponse`
   - Usa `ClienteResponse` directamente
   - Para `CentroOperacionResponse`, mantener la transformación a `{ id, nombre }`

2. **nuevo/page.tsx** - Cambiar de tipos locales a tipos centralizados
   - `CentroOperacionResponse` → transform a `{ id, nombre }`

3. **correos-por-rol/page.tsx** - Ya usa tipos correctos después de nuestra corrección
   - Cambiar a importar de `api.types.ts`

4. **formulario-editor/hooks/usePreguntaEditor.ts** - Remover casts `as any`
   - La raíz del problema es el type union muy amplio de `TIPOS_PREGUNTA`
   - Necesita refactoring más profundo (no crítico ahora)

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
