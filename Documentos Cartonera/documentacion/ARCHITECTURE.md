# Arquitectura Frontend - Portal Clientes CN

## Principio de Diseño

**Los componentes página NO hacen fetch directo**. Todos los llamados a API van a través de **servicios centralizados**.

## Estructura

```
src/
├── app/                          # Páginas Next.js (solo UI, NO lógica de API)
│   ├── seguridad/roles/page.tsx   # ✅ Usa rolesService
│   └── parametrizacion/
│       └── clientes/page.tsx      # ✅ Usa clientesService
├── services/                      # Servicios que encapsulan llamadas a API
│   ├── seguridad/
│   │   └── roles.service.ts       # POST, GET, PUT, DELETE de roles
│   ├── parametrizacion/
│   │   ├── clientes.service.ts
│   │   └── formulario-tipos-pregunta.service.ts
│   └── ...
└── lib/
    └── fetch-with-auth.ts         # Wrapper de fetch que agrega JWT automáticamente
```

## Flujo de Datos

```
Página (page.tsx)
    ↓
Servicio (service.ts)
    ↓
fetchWithAuth() [agrega token JWT]
    ↓
API Backend
```

## Crear un Nuevo Servicio

### 1. Crear el archivo de servicio

`src/services/modulo/mi-entidad.service.ts`

```typescript
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export interface MiEntidad {
  id: number;
  nombre: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const miEntidadService = {
  async getAll(): Promise<MiEntidad[]> {
    const res = await fetchWithAuth(`${API_URL}/api/modulo/entidad`);
    if (!res.ok) throw new Error("Error obteniendo datos");
    return res.json();
  },

  async create(payload: { nombre: string }): Promise<MiEntidad> {
    const res = await fetchWithAuth(`${API_URL}/api/modulo/entidad`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Error creando");
    return res.json();
  },

  async update(id: number, payload: { nombre: string }): Promise<MiEntidad> {
    const res = await fetchWithAuth(`${API_URL}/api/modulo/entidad/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Error actualizando");
    return res.json();
  },

  async delete(id: number): Promise<void> {
    const res = await fetchWithAuth(`${API_URL}/api/modulo/entidad/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Error eliminando");
  },
};
```

### 2. Usar en la página

```typescript
"use client";

import { miEntidadService, MiEntidad } from "@/services/modulo/mi-entidad.service";
import { useEffect, useState } from "react";

export default function Page() {
  const [items, setItems] = useState<MiEntidad[]>([]);

  useEffect(() => {
    miEntidadService.getAll().then(setItems).catch(console.error);
  }, []);

  return (
    <div>
      {items.map((item) => (
        <div key={item.id}>{item.nombre}</div>
      ))}
    </div>
  );
}
```

## Reglas de Oro

1. ✅ **Servicios hacen fetch con `fetchWithAuth`**
2. ✅ **Páginas usan servicios, NO fetch directo**
3. ✅ **Tipos (interfaces) viven en los servicios**
4. ✅ **Manejo de errores en servicios**
5. ❌ **NUNCA hagas `fetch()` en un componente página**

## Ventajas

- 🔒 Autenticación automática (token JWT agregado por `fetchWithAuth`)
- 📦 Reutilizable: los mismos servicios en múltiples páginas
- 🧪 Testeable: servicios pueden ser mockeados fácilmente
- 🔄 Punto centralizado para cambiar la API en el futuro
- 📝 Documentación clara: servicios indican qué endpoints existen
