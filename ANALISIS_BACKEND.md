# 📊 ANÁLISIS BACKEND - Portal Clientes CN

**Fecha:** 2026-05-02  
**Stack:** NestJS 11 + TypeORM + SQL Server  
**Puerto:** 3001

---

## 📋 Resumen Ejecutivo

Backend monolítico en NestJS que gestiona la lógica de comercial onboarding (vinculación comercial). Utiliza TypeORM con SQL Server, autenticación JWT, y 30+ módulos. Tiene problemas significativos de mantenibilidad por uso extensivo de raw SQL queries.

**Estado General:** ⚠️ **FUNCIONAL PERO CON MALA ARQUITECTURA**

---

## 🏗️ Arquitectura

### Estructura de Módulos

```
BACKEND/src/
├── auth/                       # Autenticación JWT
├── usuarios/                   # Gestión de usuarios
├── clientes/                   # Gestión de clientes
├── solicitudes/                # Workflow de solicitudes
├── formulario/                 # Gestión de formularios
├── parametrizacion/            # Configuración del sistema
│   ├── documentos/
│   ├── estados/
│   ├── formularios/
│   ├── tipos-documentos/
│   └── ...
├── notificaciones/             # Emails y notificaciones
├── centros-operacion/          # Operational centers
├── modulos/                    # Módulos del menú
├── seguridad/                  # Permisos y roles
├── workflow/                   # Estados y transiciones
├── maestros/                   # Datos maestros
├── condiciones-financieras/    # Condiciones financieras
├── pqrs/                       # Peticiones y reclamos
└── indicadores/                # Reportes y KPIs
```

### Flujo General

```
POST /api/auth/login
  ↓
AuthService.login(email, password)
  ↓
resolveUserColumns() + resolveClientColumns() ← SQL dinámico ⚠️
  ↓
getModulesByRole(rolId) ← SQL directo
  ↓
Retorna { token, user, modulos }
```

---

## ⚠️ ERRORES Y PROBLEMAS IDENTIFICADOS

### 🔴 CRÍTICOS

#### 1. **Raw SQL Queries en Lugar de TypeORM**

- **Archivo:** `src/auth/auth.service.ts` (líneas 231-248, 295-303, 308-330)
- **Problema:** Queries SQL directas en TypeScript, sin validación:
  ```typescript
  const usuario = await this.dataSource.query(
    `
    SELECT u.${userCols.id_col} AS usr_id,
           u.${userCols.nombre_col} AS nombre,
           ...
    FROM usuarios u
    WHERE u.${userCols.email_col} = @0
  `,
    [email],
  );
  ```
- **Riesgos:**
  - SQL Injection (aunque con parámetros, la lógica dinámica es riesgosa)
  - Difícil de debuggear
  - No hay tipado de resultados
  - Caminos SQL múltiples basados en schema migration
- **Impacto:** Alto riesgo de seguridad y mantenibilidad
- **Solución:** Usar QueryBuilder o relaciones TypeORM

#### 2. **Resolución Dinámica de Columnas**

- **Archivos:** `src/auth/auth.service.ts` líneas 36-65
- **Problema:**
  ```typescript
  CASE WHEN COL_LENGTH('usuarios','usr_id') IS NOT NULL
       THEN 'usr_id'
       ELSE 'usr_id'
  END
  ```
  Intenta detectar si columnas se llaman `usr_*` o `usuario_*`
- **Impacto:**
  - Código de migración legacy hardcodeado
  - Performance: extra queries en cada login
  - Confuso: ¿Cuál es el esquema real?
- **Solución:** Estandarizar esquema, eliminar esta lógica

#### 3. **Auto-Creación de Clientes en Login**

- **Archivo:** `src/auth/auth.service.ts` líneas 278-334
- **Problema:**
  ```typescript
  if (isAdminRole && !cliente_id) {
    // Si admin no tiene cliente, crear uno automáticamente
    const creado = await this.dataSource.query(`
      INSERT INTO clientes (...)
      VALUES (...)
    `);
  }
  ```
- **Riesgos:**
  - Side effects en endpoint de login
  - Crea datos fantasma
  - No es explícito en la UI
- **Impacto:** Datos inconsistentes, confusión en auditoría
- **Solución:** Separar creación de cliente a endpoint específico

#### 4. **Console.log en Producción**

- **Archivo:** `src/auth/auth.controller.ts` línea 14
  ```typescript
  console.log('login DAVID authService:', this.authService); // 👈 AQUÍ
  ```
- **Impacto:** Información sensible expuesta, debug flags dejados
- **Solución:** Usar Logger de NestJS

#### 5. **Falta Validación en DTOs**

- **Archivo:** `src/auth/dto/login.dto.ts`
- **Problema:** DTO no valida email format, password strength
- **Código en Controller:**
  ```typescript
  async login(@Body() body: LoginDto) {
    // No hay @IsEmail(), @MinLength(), etc.
  }
  ```
- **Impacto:** Requests inválidos llegan al servicio
- **Solución:** Usar class-validator en DTOs

#### 6. **Sincronización TypeORM Desactivada**

- **Archivo:** `src/database/typeorm.config.ts`
  ```typescript
  synchronize: false; // ✅ Correcto
  ```
- **Observación:** Está bien, pero significa cambios de schema van por SQL manual
- **Problema:** Sin documentación de cambios de schema
- **Solución:** Mantener scripts SQL de migración versionados

### 🟠 ALTOS

#### 7. **Complejidad Excesiva en getModulesByRole()**

- **Archivo:** `src/auth/auth.service.ts` líneas 92-224
- **Problema:** Función de 130 líneas con:
  - Detección dinámica de tabla junction
  - Búsqueda de relaciones en información_schema
  - Construcción manual de tree de módulos
- **Impacto:** Difícil de testear, difícil de mantener
- **Solución:** Usar QueryBuilder y relaciones TypeORM

#### 8. **Error Handling Inconsistente**

- **Archivo:** `src/solicitudes/solicitudes.controller.ts` líneas 30-68
  ```typescript
  try {
    // ...
  } catch (error) {
    return {
      ok: false,
      mensaje: error.message,
    };
  }
  ```
- **Problema:**
  - Retorna HTTP 200 incluso en error
  - No usa excepciones de NestJS (BadRequestException, etc.)
  - Mensaje de error expuesto al cliente
- **Impacto:** Inconsistencia en API, información sensible
- **Solución:** Usar `throw new BadRequestException()`

#### 9. **Falta Autenticación en Algunos Endpoints**

- **Verificación:** `src/solicitudes/solicitudes.controller.ts` línea 25
  ```typescript
  @UseGuards(JwtAuthGuard)
  @Controller('solicitudes')
  ```
- **Observación:** Está protegio, pero algunos endpoints retornan datos genéricos
- **Problema:** No hay verificación de autorización (solo autenticación)
- **Solución:** Añadir `@Roles()` decorador en endpoints sensibles

#### 10. **DTOs No Completamente Validados**

- **Archivo:** `src/solicitudes/dto/`
- **Problema:** DTOs sin `@IsNotEmpty()`, `@IsInt()`, etc.
- **Impacto:** Datos malformados pasan al servicio
- **Solución:** Añadir decoradores class-validator

#### 11. **Falta de Paginación en Endpoints**

- **Archivo:** `src/solicitudes/solicitudes.controller.ts` línea 90
  ```typescript
  @Get()
  async listarSolicitudes(@Query('limit') limit: string) {
    const limitNum = limit ? Number(limit) : 50;
  ```
- **Problema:** Sin offset, sin validación de limit
- **Impacto:** Queries lentas con muchos datos
- **Solución:** Implementar paginación estándar (skip, take)

### 🟡 MEDIOS

#### 12. **Logging Manual en Lugar de Logger**

- **Archivo:** Múltiples controllers
- **Ejemplo:** `console.log()` en lugar de `this.logger.log()`
- **Impacto:** Logs no estructurados, difíciles de monitorear
- **Solución:** Usar `@nestjs/common` Logger

#### 13. **Módulos Muy Grandes**

- **Problema:** Módulos como `solicitudes`, `formulario` tienen 100+ líneas
- **Solución:** Dividir en submódulos más pequeños

#### 14. **Falta Documentación de API**

- **Problema:** No hay Swagger/OpenAPI documentado
- **Impacto:** Clientes (frontend) no saben qué endpoints existen
- **Solución:** Instalar `@nestjs/swagger` y documentar controllers

#### 15. **Sin Transacciones en Operaciones Multi-Tabla**

- **Archivo:** `src/auth/auth.service.ts` líneas 295-330
- **Problema:** Insert en clientes y update en relaciones sin transacción
- **Riesgo:** Si falla el update, queda datos inconsistentes
- **Solución:** Usar `await dataSource.transaction()`

#### 16. **Hardcoding de Valores**

- **Archivo:** `src/auth/auth.service.ts` línea 305-306
  ```typescript
  const nitAdmin = `ADM-${user.usr_id}`;
  const razonSocialAdmin = `CLIENTE ADMINISTRACION ${user.usr_id}`;
  ```
- **Problema:** Valores hardcodeados, no configurables
- **Solución:** Usar ConfigService

---

## 🎯 MEJORAS RECOMENDADAS

### Corto Plazo (1-2 semanas)

- [ ] Remover `console.log('login DAVID ...')`
- [ ] Implementar class-validator en todos los DTOs
- [ ] Usar `throw new BadRequestException()` en lugar de return { ok: false }
- [ ] Reemplazar Logger manual con `@nestjs/common` Logger
- [ ] Remover auto-creación de clientes en login

### Mediano Plazo (1 mes)

- [ ] Reescribir `auth.service.ts` usando QueryBuilder
- [ ] Eliminar resolución dinámica de columnas, estandarizar schema
- [ ] Implementar `getRoleModuleRelationTable()` con TypeORM
- [ ] Añadir `@Roles()` decorador en endpoints sensibles
- [ ] Implementar paginación estándar en todos los GET
- [ ] Añadir `@nestjs/swagger` para documentación

### Largo Plazo (2-3 meses)

- [ ] Tests unitarios para servicios (>80% coverage)
- [ ] Tests E2E con supertest
- [ ] Implementar transacciones en operaciones multi-tabla
- [ ] Implementar caché (Redis) para módulos por rol
- [ ] Auditoría de cambios en datos sensibles
- [ ] Rate limiting
- [ ] Implementar soft-delete en lugar de delete físico

---

## 📊 Análisis de Módulos

### Módulos Principales

| Módulo          | Líneas | Estado     | Problemas                          |
| --------------- | ------ | ---------- | ---------------------------------- |
| auth            | 400+   | ⚠️ Crítico | Raw SQL, resolución dinámica       |
| solicitudes     | 300+   | 🟠 Alto    | Sin paginación, manejo error pobre |
| usuarios        | 200+   | 🟠 Alto    | Falta validación                   |
| formulario      | 250+   | 🟡 Medio   | Lógica compleja                    |
| parametrizacion | 800+   | 🟡 Medio   | Muchos sub-módulos                 |

---

## 🔐 Checklist de Seguridad

- ✅ Autenticación JWT implementada
- ⚠️ Validación de entrada débil (sin class-validator)
- ❌ SQL queries con columnas dinámicas (XSS risk)
- ❌ Error messages exponen información del sistema
- ❌ Sin rate limiting
- ❌ Sin validación de CORS en detail
- ⚠️ Console.log con información sensible
- ❌ Sin protección contra SQL injection en queries dinámicas
- ❌ Sin auditoría de cambios

---

## 🔄 Flujos Críticos

### Login Flow

```
POST /api/auth/login
  ├─ Validar email/password
  ├─ Buscar usuario (raw SQL) ⚠️
  ├─ Verificar contraseña
  ├─ Obtener módulos (SQL dinámico) ⚠️
  ├─ Auto-crear cliente si admin ⚠️
  └─ Retornar { token, user, modulos }
```

### Solicitud Flow

```
POST /api/solicitudes
  ├─ Validar JWT
  ├─ Crear solicitud (sin validar DTO)
  └─ Retornar { ok, data } ⚠️
```

---

## 📦 Dependencias Principales

```json
{
  "@nestjs/core": "^11.0.1",
  "@nestjs/typeorm": "^11.0.0",
  "typeorm": "^0.3.28",
  "mssql": "^12.2.0",
  "@nestjs/jwt": "^11.0.2",
  "bcrypt": "^6.0.0",
  "nodemailer": "^7.0.12",
  "class-validator": "^0.14.3",
  "class-transformer": "^0.5.1"
}
```

**Observación:** `bcryptjs` Y `bcrypt` instalados - redundante

---

## 📈 Métricas

- **Archivos TypeScript:** ~40+
- **Módulos NestJS:** ~25+
- **Controllers:** ~30+
- **Services:** ~30+
- **Entities:** ~20+
- **Tests:** 0-5 ❌
- **Líneas de SQL directo:** 500+

---

## 🎓 Conclusión

Backend funcional pero con deuda técnica importante:

1. **Mantenibilidad:** Raw SQL queries, lógica dinámica compleja
2. **Seguridad:** Validación débil, error handling pobre
3. **Escalabilidad:** Sin paginación, sin caché, queries ineficientes
4. **Calidad:** Sin tests, console.log en producción
5. **Documentación:** Sin Swagger, sin comentarios

**Prioridad de Fixes:**

1. 🔴 Reescribir `auth.service` con QueryBuilder
2. 🔴 Eliminar resolución dinámica de columnas
3. 🟠 Implementar class-validator en DTOs
4. 🟠 Usar NestJS exceptions en lugar de { ok: false }
5. 🟡 Añadir @nestjs/swagger para documentación
