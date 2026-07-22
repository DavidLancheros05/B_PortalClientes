# Menú dinámico por rol (`pc_modulos` / `pc_rol_modulo`)

Descubierto/documentado el 2026-07-21 al construir las 4 páginas de
"Consultas SIESA" (remisiones, facturas, existencias, cartera): el código
(página `page.tsx` + módulo NestJS) quedó funcional por URL directa, pero no
apareció en el menú de ningún rol hasta registrar el módulo en base de
datos.

## El menú no se deriva de las rutas del código

El árbol de navegación del portal (`FRONTEND/src/components/layout/Header.tsx`)
no lista rutas hardcodeadas ni descubre `page.tsx` nuevos automáticamente.
Sale enteramente de dos tablas SQL Server:

- **`pc_modulos`**: un ítem de menú por fila.
  - `mod_id`, `mod_nombre`, `mod_ruta`, `mod_icono`
  - `mod_padre_id` — NULL si es de primer nivel; si no, apunta al `mod_id`
    del módulo padre (así se arma la jerarquía tipo "Pedidos" → "Mis
    pedidos" / "Pedidos faltantes")
  - `mod_posicion` — orden dentro de su nivel/padre
  - `mod_estado` — módulo activo o no (soft-delete)
- **`pc_rol_modulo`**: qué puede hacer cada rol con cada módulo.
  - `rm_rol_id`, `rm_mod_id`
  - `rm_ver`, `rm_crear`, `rm_editar`, `rm_eliminar`, `rm_aprobar` (bits)
  - `rm_activo`

`BACKEND/src/modulos/modulos.service.ts::findByRol(rolId)` arma el árbol
completo de `pc_modulos` con `mod_estado = 1`, le pega los permisos del rol
desde `pc_rol_modulo`, y **filtra recursivamente** cualquier módulo (o rama)
donde el rol no tenga ningún permiso en `true`:

```ts
const tienePermiso = (modulo, permisos) => {
  const tieneEnModulo = permisos.some(p => modulo.permisos[p]);
  const hijosConPermiso = modulo.subModulos?.some(hijo => tienePermiso(hijo, permisos));
  return tieneEnModulo || hijosConPermiso;
};
```

Es decir: **un módulo sin fila en `pc_rol_modulo` para ese rol simplemente
no existe para él**, aunque `mod_estado = 1` y el código de la página esté
perfecto.

`FRONTEND/src/components/layout/Header.tsx` consume este árbol vía
`GET /seguridad/modulos/por-rol?rol_id=...` y arma los links con
`resolveModuloRoute(m)` sobre `mod_ruta`.

## Checklist para que una página nueva aparezca en el menú

1. Código de la página (`FRONTEND/src/app/**/page.tsx`) y su módulo backend
   — esto por sí solo **no la hace visible**, solo la hace alcanzable por
   URL directa.
2. Insertar en `pc_modulos`: el módulo (y su padre primero, si es
   jerárquico como "Consultas" → "Remisiones y devoluciones").
3. Insertar en `pc_rol_modulo` una fila por cada rol que deba verlo, con
   al menos `rm_ver = 1`.
4. Si la ruta debe quedar detrás del login (normalmente sí), agregarla
   también al `matcher` de `FRONTEND/src/proxy.ts`. **Es un mecanismo
   independiente** — controla si la ruta exige JWT válido, no si aparece
   en el menú. Faltar el paso 2/3 dejaba la página "invisible pero
   accesible por URL"; faltar este paso 4 la deja "sin gate de
   autenticación" (accesible sin login).

Pasos 2-3 deben ir en una migración SQL versionada en `migrations/`
(mismo criterio que cualquier otro cambio de esquema/datos del proyecto),
usando el patrón idempotente `IF NOT EXISTS (...) BEGIN INSERT ... END ELSE
BEGIN UPDATE ... END` para que correrla dos veces no duplique filas.
Ejemplos ya en el repo:

- `migrations/20260716_actualizar_modulos_pqrs.sql` — módulo PQRS + 2 hijos,
  permisos solo para CLIENTE.
- `migrations/20260721_crear_modulos_consultas.sql` — módulo "Consultas" +
  4 hijos (remisiones/facturas/existencias/cartera), permisos para 7 roles
  vía cursor, replicando exactamente el patrón que ya tenía "Pedidos"
  (`mod_id` 75/76/77): ADMIN con los 5 permisos en `true`, CLIENTE solo con
  `rm_ver`, el resto de roles con fila presente pero todo en `false` (el rol
  COMERCIAL, `rol_id` 4, se deja fuera a propósito — "Pedidos" tampoco le
  asigna fila).

## Cómo verificar en vivo (sin levantar el frontend)

```bash
cd BACKEND
# Árbol de un módulo existente, para copiar su patrón antes de crear uno nuevo
node scripts/db-query.mjs "SELECT mod_id, mod_nombre, mod_ruta, mod_padre_id, mod_posicion, mod_estado FROM pc_modulos WHERE mod_ruta LIKE '/pedidos%' ORDER BY mod_padre_id, mod_posicion"

# Qué roles ven un módulo puntual
node scripts/db-query.mjs "SELECT rm.rm_rol_id, r.rol_nombre, rm.rm_ver FROM pc_rol_modulo rm LEFT JOIN pc_roles r ON r.rol_id = rm.rm_rol_id WHERE rm.rm_mod_id = 75"
```

Roles activos hoy (`pc_roles`): `1=ADMIN`, `2=CLIENTE`, `3=EJECUTIVO`,
`4=COMERCIAL`, `5=AUXILIAR SERVICIO CLIENTE`, `6=OFICIAL DE CUMPLIMIENTO`,
`7=COMITE CREDITO 1`, `8=COMITE CREDITO 2`.
