# 📊 ANÁLISIS FRONTEND - Portal Clientes CN

**Fecha:** 2026-05-02  
**Stack:** Next.js 16 + React 19 + Tailwind CSS + Axios  
**Puerto:** 3000

---

## 📋 Resumen Ejecutivo

El frontend es una aplicación Next.js 16 con App Router que actúa como interfaz para un sistema de gestión de solicitudes comerciales (vinculación comercial). Utiliza autenticación JWT, gestión centralizada de estado con React Context, y comunicación API mediante Axios.

**Estado General:** ⚠️ **FUNCIONAL CON PROBLEMAS DE CALIDAD**

---

## 🏗️ Arquitectura

### Estructura de Directorios

```
FRONTEND/
├── src/
│   ├── app/                    # App Router (Next.js 16)
│   │   ├── page.tsx            # Página raíz
│   │   ├── layout.tsx          # Layout global
│   │   ├── solicitudes/        # Módulo de solicitudes
│   │   ├── usuarios/           # Gestión de usuarios
│   │   ├── parametrizacion/    # Configuración
│   │   ├── admin/              # Panel administrativo
│   │   └── ...
│   ├── components/             # Componentes reutilizables
│   ├── context/                # Context API (Auth, Notifications)
│   ├── services/               # Capa de servicios (API calls)
│   ├── hooks/                  # Custom React hooks
│   └── utils/                  # Utilidades
├── public/                     # Activos estáticos
└── package.json
```

### Capas Principales

1. **Autenticación** → `src/context/AuthContext.tsx`
2. **API** → `src/services/` + `src/services/api.ts` (Axios)
3. **UI** → Componentes React + Tailwind CSS
4. **Enrutamiento** → Next.js App Router
5. **Estado Local** → React hooks + Context API

---

## ⚠️ ERRORES Y PROBLEMAS IDENTIFICADOS

### 🔴 CRÍTICOS

#### 1. **LoginForm.tsx Comentado**

- **Archivo:** `src/components/LoginForm.tsx`
- **Problema:** Todo el componente está comentado. No se sabe si es código legado o en desarrollo.
- **Impacto:** Genera confusión, ocupa espacio innecesario.
- **Solución:** Eliminar si no se usa, o descomentar y refactorizar si se necesita.

#### 2. **Token Almacenado en localStorage INSEGURO**

- **Archivo:** `src/services/api.ts`, `src/context/AuthContext.tsx`
- **Problema:**
  - JWT se almacena en localStorage (vulnerable a XSS)
  - No hay protección contra CSRF
  - Token expira en 7 días sin validación de refresh
- **Impacto:** Riesgo de seguridad crítico
- **Solución:** Usar httpOnly cookies en lugar de localStorage

#### 3. **Normalización de Rol Inconsistente**

- **Archivo:** `src/context/AuthContext.tsx` (líneas 68-84, 99-115, 140-155)
- **Problema:** Lógica compleja para normalizar estructura de rol en 3 lugares diferentes
- **Código:**
  ```typescript
  rol: typeof parsedUser.rol === "string"
    ? { nombre: parsedUser.rol.toUpperCase(), rol_id: ... }
    : parsedUser.rol
  ```
- **Impacto:** Código duplicado, difícil de mantener
- **Solución:** Crear función `normalizeUser()` reutilizable

#### 4. **useAuth Hook No Tipado**

- **Archivo:** `src/hooks/useAuth.tsx`
- **Problema:** Hook personalizado sin tipos TypeScript adecuados
- **Impacto:** Errores en tiempo de ejecución no detectables
- **Solución:** Añadir tipos completos en el hook

### 🟠 ALTOS

#### 5. **Falta de Error Boundaries**

- **Problema:** No hay Error Boundaries en componentes principales
- **Impacto:** Crashes de la aplicación sin fallback
- **Solución:** Implementar Error Boundary en `layout.tsx`

#### 6. **Llamadas API sin Retry Logic**

- **Archivo:** Todos los servicios en `src/services/`
- **Problema:** No hay reintentos automáticos en caso de fallo temporal
- **Impacto:** Mala UX en conexiones inestables
- **Solución:** Añadir interceptor de retry en axios

#### 7. **Gestión de Estado Inconsistente**

- **Problema:** Mezcla de localStorage + React Context + localStorage nuevamente
- **Ejemplo:**
  - AuthContext intenta rescatar usuario de localStorage
  - Luego hace llamada API innecesaria
  - Guarda de nuevo en localStorage
- **Impacto:** Lógica confusa, múltiples sources of truth
- **Solución:** Centralizar en una fuente única de verdad

#### 8. **Falta de Loading States en Componentes**

- **Problema:** Muchos componentes no manejan estados de carga
- **Impacto:** UI congelada, usuario no sabe si algo está procesándose
- **Solución:** Implementar loading indicators en todos los formularios

### 🟡 MEDIOS

#### 9. **Proxy API Hardcodeado**

- **Archivo:** `next.config.ts`
- **Problema:** URL del backend hardcodeada en desarrollo
- **Solución:** Usar variable de entorno `BACKEND_URL`

#### 10. **Falta de Validación de Inputs**

- **Problema:** Componentes de formulario no validan datos antes de enviar
- **Impacto:** Backend rechaza datos inválidos, mala UX
- **Solución:** Implementar Zod + react-hook-form en todos los formularios

#### 11. **Console.log Abundante**

- **Archivo:** Múltiples archivos (AuthContext, servicios, componentes)
- **Ejemplo:** `console.log("[AuthContext] login", userData)`
- **Impacto:** Código desordenado, leak de información en producción
- **Solución:** Remover o usar logger estructurado

#### 12. **Ninguna Prueba Unitaria**

- **Problema:** No hay tests en `__tests__/` o `.test.ts`
- **Impacto:** Cambios rompen funcionalidad sin detectarse
- **Solución:** Añadir tests con Jest + React Testing Library

---

## 🎯 MEJORAS RECOMENDADAS

### Corto Plazo (1-2 semanas)

- [ ] Eliminar `LoginForm.tsx` comentado
- [ ] Remover todos los `console.log` en servicios
- [ ] Implementar Error Boundary en `layout.tsx`
- [ ] Crear función `normalizeUser()` centralizada
- [ ] Añadir variables de entorno para URLs sensibles

### Mediano Plazo (1 mes)

- [ ] Migrar JWT a httpOnly cookies + CSRF tokens
- [ ] Implementar interceptor de retry en Axios
- [ ] Centralizar estado en Context único con useReducer
- [ ] Añadir loading states en todos los formularios
- [ ] Implementar validación con Zod en servicios

### Largo Plazo (2-3 meses)

- [ ] Reemplazar Context API con Zustand o Redux
- [ ] Implementar SWR o React Query para cache de datos
- [ ] Tests unitarios para servicios (>80% coverage)
- [ ] Tests E2E con Playwright
- [ ] Implementar logging estructurado (Winston, Pino)
- [ ] Code splitting automático y lazy loading

---

## 🔄 FLUJO ACTUAL

```
Usuario → LoginForm → api.post("/auth/login")
           ↓
        AuthService.login()
           ↓
        JWT + user data + modulos
           ↓
        AuthContext.login(token, user)
           ↓
        localStorage.setItem("token", "user")
           ↓
        → Redirige a /dashboard
           ↓
        Componentes leer user desde Context
           ↓
        Llamadas API con Bearer token
```

---

## 📦 Dependencias Principales

```json
{
  "next": "16.1.1",
  "react": "19.2.3",
  "react-hook-form": "^7.69.0",
  "axios": "^1.13.2",
  "tailwindcss": "^4",
  "zod": "^4.2.1",
  "bcryptjs": "^3.0.3",
  "jose": "^6.1.3",
  "js-cookie": "^3.0.5"
}
```

**Observación:** Tiene `bcryptjs`, `jose`, `jsonwebtoken` en frontend - innecesario, solo debería estar en backend.

---

## 🔐 Checklist de Seguridad

- ❌ JWT en localStorage (debe ser httpOnly cookie)
- ❌ No hay CSRF protection
- ❌ No hay rate limiting en cliente
- ❌ No hay validación de CSP headers
- ❌ Información de error expuesta en console.log
- ⚠️ Roles hardcodeados en comparaciones string
- ⚠️ No hay refresh token strategy

---

## 📊 Métricas

- **Archivos TypeScript/TSX:** ~50+
- **Servicios API:** ~15
- **Páginas (Routes):** ~30+
- **Componentes Reutilizables:** ~10
- **Custom Hooks:** ~3
- **Tests:** 0 ❌

---

## 🎓 Conclusión

El frontend funciona pero tiene deudas técnicas significativas:

1. **Seguridad:** Tokens en localStorage es riesgo crítico
2. **Mantenibilidad:** Código duplicado y console.log innecesario
3. **Calidad:** Sin tests, sin validación de inputs
4. **Escalabilidad:** Estado centralizado pero sin patrón claro
5. **UX:** Falta de loading states y error handling

**Prioridad de Fixes:**

1. 🔴 Migrar JWT a httpOnly cookies
2. 🔴 Eliminar LoginForm comentado
3. 🟠 Implementar Error Boundary
4. 🟠 Remover console.log
5. 🟡 Añadir validación Zod
