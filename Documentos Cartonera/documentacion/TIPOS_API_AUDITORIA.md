# Auditoría de Tipos API - Sincronización Frontend/Backend

## 1. Cliente (`GET /clientes/:id`)

**Qué devuelve el backend:**

```typescript
{
  cli_id: number;
  razonSocial: string;
  nitDocumento: string;
  direccion: string;
  tipoIdentificacion: number;
  habilitaAcceso: boolean;
  email: string;
  estado: string;
  ejng_id: number;
  ejecutivo: { nombre: string } | null;
}
```

**Notas:**

- Backend mapea `cli_razon_social → razonSocial` (camelCase)
- `ejecutivo` viene del LEFT JOIN a `Ejecutivo_negocio`
- Todos los campos críticos están presentes

---

## 2. Centro de Operación (`GET /centros-operacion`)

**Qué devuelve el backend:**

```typescript
{
  cop_id: number;
  cop_nombre: string;
  cop_estado: string;
  cop_fecha_usr?: Date;
  cop_usuario?: string;
  f285_id?: string;
}
```

**Notas:**

- La entidad devuelve los nombres de BD directamente (cop\_\*, no id/nombre)
- **IMPORTANTE:** `GET /clientes/:id/centros-operacion` mapea estos a `{ id, nombre }`

---

## 3. Correos por Rol

### getRoles (`GET /parametrizacion/correos-por-rol/roles`)

```typescript
{
  rol_id: number;
  rol_nombre: string;
  rol_codigo: string;
}
```

### getAll (`GET /parametrizacion/correos-por-rol`)

```typescript
{
  correo_id: number;
  rol_id: number;
  rol_nombre: string;
  rol_codigo: string;
  email: string;
  activo: boolean;
  created_at: string;
  updated_at?: string | null;
}
```

**Notas:**

- Backend JOIN a tabla `roles` para traer rol_nombre y rol_codigo
- El campo es `email`, no `correo`

---

## Problema Identificado

| Servicio          | Campo BD   | Frontend Esperaba | Real                   |
| ----------------- | ---------- | ----------------- | ---------------------- |
| centros-operacion | cop_id     | id                | ❌ cop_id              |
| centros-operacion | cop_nombre | nombre            | ❌ cop_nombre          |
| clientes          | ejecutivo  | { id, nombre }    | ✅ { nombre } (sin id) |
| correos-rol       | email      | correo            | ❌ email               |
| correos-rol       | correo_id  | id                | ✅ correo_id           |

---

## Solución

### Opción A: Transform en el Frontend

Mapear `cop_id → id` y `cop_nombre → nombre` cuando se reciben de la API

### Opción B: Aceptar Nombres de BD (Recomendado)

Usar `cop_id` y `cop_nombre` directamente en interfaces y componentes

Elegimos **Opción B** porque:

- Más consistente con backend
- Menos transformaciones
- Menos bugs de mapeo
