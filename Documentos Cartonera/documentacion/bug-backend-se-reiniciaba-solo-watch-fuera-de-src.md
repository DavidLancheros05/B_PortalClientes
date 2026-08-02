# Bug: el backend se reiniciaba solo constantemente (páginas "trabadas" al navegar)

> Encontrado el 2026-07-25 por el usuario: *"le doy gestion de versiones y se demora una eternidad en cargar la otra pagina... como te digo la pagina deberia cargar de primeras y luego ahi si ir al backend, no se por que se queda en la pagian anterior como trabada"*, en `http://localhost:3002/parametrizacion/formularios` → "Gestionar versiones".

## Síntoma reportado

Varias páginas del frontend (`solicitudes/listado-de-solicitudes`, `parametrizacion/formularios/[id]/versiones`, etc.) se sentían "pegadas" en la página anterior al navegar, con demoras de varios segundos. Ya se había descartado como causa el bundle del frontend (ver el fix de `xlsx` con import dinámico) y un proceso duplicado del backend (ver nota en `mejoras/COSTOS_DE_SESION.md`, punto 2) — pero el síntoma volvió a aparecer con una sola instancia limpia corriendo.

## Causa raíz

**Archivo:** `B_PortalClientes/tsconfig.build.json`

```json
// ANTES
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

Sin una clave `"include"`, TypeScript resuelve el conjunto de archivos a vigilar sobre **todo el directorio del proyecto** (todo lo que no esté en `exclude`). El repo del backend tiene, además de `src/`, varias carpetas de contenido no relacionado con el código en su raíz:

- `Documentos Cartonera/` (documentación técnica, ~1.8 MB — incluye los `.md` de análisis y bugs, como este mismo archivo)
- `Documentos-Formularios/`, `Documentos-Solicitudes/` (adjuntos de referencia, ~4.5 MB)
- `public/uploads/solicitudes/` (documentos reales subidos por clientes a través del portal, crece con el uso normal de la app)

Ninguna de esas carpetas estaba en el `exclude`. El watcher de `nest start --watch` (basado en el *watch program* de TypeScript) vigila directorios completos para detectar archivos nuevos que calcen con el `include` — y **cualquier evento del sistema de archivos dentro de esos directorios** (no solo archivos `.ts`) puede disparar su callback de "cambio detectado", forzando una recompilación y un **reinicio completo del proceso Nest** (mata y relanza todo, no hay hot-reload parcial).

Se confirmó en vivo revisando el log de una sesión de ~2 horas: **33 reinicios** ("File change detected. Starting incremental compilation...") disparados sin que nadie tocara código — coincidiendo con momentos en que se editaba documentación en `Documentos Cartonera/documentacion/`. Cada reinicio tarda ~10s en volver a levantar (recompilar + reconectar TypeORM + mapear ~200 rutas) y tumba cualquier conexión HTTP en curso. Si el clic del usuario en el frontend coincidía con una de esas ventanas, la petición se quedaba colgada hasta que el proceso volvía a estar arriba — de ahí la sensación de página "trabada".

Esto probablemente también es la causa real (o un agravante) del bug ya documentado como *"`nest start --watch` a veces revienta con `EADDRINUSE`"* en `CLAUDE.md`: con reinicios tan frecuentes, dos ciclos de reinicio pueden solaparse y competir por el puerto.

## Fix aplicado

```json
// DESPUÉS
{
  "extends": "./tsconfig.json",
  "include": ["src/**/*"],
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

Restringe el watch a `src/` únicamente, que es lo único que de verdad necesita recompilarse.

## Verificación

- Con el backend corriendo tras el fix: tocar un archivo dentro de `Documentos Cartonera/documentacion/` → **no** dispara "File change detected" (antes sí).
- Editar contenido real de `src/main.ts` → sigue disparando la recompilación normalmente (el watch real no se rompió).
- `GET /api/centros-operacion` respondió en 0.36s inmediatamente después del reinicio limpio, sin caídas posteriores durante la verificación.

## Nota para el futuro

Si vuelve a aparecer la sensación de "página trabada" o el error `EADDRINUSE`, antes de asumir que es un problema del frontend o de una query lenta, revisar primero si el log de `nest start --watch` muestra "File change detected" repetido sin relación con ediciones de código — es la señal de que el watch se salió de `src/` otra vez (por ejemplo, si se agrega una carpeta nueva de contenido no-código en la raíz del repo del backend, hay que sumarla al `exclude` o confirmar que el `include: ["src/**/*"]` la sigue dejando fuera).
