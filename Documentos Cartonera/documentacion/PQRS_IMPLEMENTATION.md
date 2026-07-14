# Implementación de Módulo PQRS - Modernización UX/UI

## Descripción

Se creó una solución completa y moderna para la gestión de PQRS (Peticiones, Quejas, Reclamos y Sugerencias) con diseño tipo dashboard empresarial.

---

## Componentes Creados

### 1. **StateBadge** (`src/components/pqrs/StateBadge.tsx`)

Badge elegante para mostrar estados con colores dinámicos.

**Estados soportados:**

- PENDIENTE (Amarillo)
- RECIBIDO (Azul)
- EN_CLASIFICACION (Púrpura)
- ASIGNADO (Índigo)
- EN_GESTION (Cian)
- PENDIENTE_CLIENTE (Naranja)
- EN_REVISION (Azul)
- RESPONDIDO (Verde)
- RESUELTA (Verde)
- CERRADO (Gris)
- RECHAZADA (Rojo)
- ESCALADO (Rojo)

Propiedades:

- `estado`: string - Estado de la PQRS
- `className`: string (opcional) - Clases adicionales

### 2. **TableSkeleton** (`src/components/pqrs/TableSkeleton.tsx`)

Loading skeleton elegante para tabla de PQRS.

- Simula estructura de tabla con 5 filas
- Animación de pulseo en placeholders
- Responsive design

### 3. **EmptyState** (`src/components/pqrs/EmptyState.tsx`)

Estado vacío elegante con ícono y CTA.

**Propiedades:**

- `title`: string - Título del estado
- `description`: string - Descripción
- `onCreateClick`: función callback para botón crear
- `showCreateButton`: boolean - Mostrar/ocultar botón

### 4. **PQRSTimeline** (`src/components/pqrs/PQRSTimeline.tsx`)

Timeline visual de eventos de la PQRS.

**Features:**

- Icono dinámico según tipo de evento
- Transiciones de estado con flechas
- Fechas formateadas en español (date-fns)
- Línea conectora entre eventos
- Fallback elegante cuando no hay eventos

### 5. **PQRSComments** (`src/components/pqrs/PQRSComments.tsx`)

Sistema de comentarios tipo chat.

**Features:**

- Listado de comentarios con avatares
- Badge de "Interno" para comentarios administrativos
- Textarea para nuevas respuestas
- Contador de caracteres
- Botón "Responder" solo si estado = PENDIENTE_CLIENTE
- Scroll automático al último comentario
- Estados de carga

---

## Páginas Actualizadas/Creadas

### 1. **Listado de Mis PQRS** (`src/app/pqrs/mis-pqrs/page.tsx`)

**Features Implementadas:**

#### Búsqueda

- Input de búsqueda en tiempo real
- Busca por número, título o descripción
- Ícono de búsqueda en el input

#### Filtros por Estado

- Botones dinámicos con estados disponibles
- Filtrado múltiple
- Botón "Limpiar" cuando hay filtros activos

#### Paginación

- 10 items por página (configurable)
- Botones anterior/siguiente
- Números de página con elipsis
- Información de página actual

#### Tabla Principal

- 6 columnas: No. PQRS, Asunto, Tipo, Estado, Fecha creación, Acción
- Hover effects
- StateBadges para estados
- Botón "Ver detalle" con ícono

#### Estados de Carga

- Loading skeleton elegante
- Empty state cuando no hay PQRS
- Empty state cuando búsqueda no retorna resultados

#### Diseño Responsive

- Funciona en móvil, tablet y desktop
- Grid adaptativo
- Tabla scrollable en móviles

#### Estadísticas

- Total de PQRS
- Resultados mostrados vs. filtrados
- Información en footer elegante

### 2. **Detalle de PQRS** (`src/app/pqrs/[id]/page.tsx`)

**Secciones:**

#### Encabezado

- Título de la PQRS
- Número único (PQRS-2026-05-000001)
- Badge de estado
- Botón volver

#### Información General

Grid de 2 columnas con:

- Fecha de creación
- Tipo de PQRS
- Prioridad
- Horas para vencimiento

#### Descripción

Sección expandible con texto completo de la PQRS

#### Tabs de Contenido

**Tab 1: Timeline**

- Visualización cronológica de cambios de estado
- Iconos dinámicos para tipos de eventos
- Transiciones visibles con flechas
- Información de quién y cuándo cambió

**Tab 2: Comentarios**

- Chat bidireccional
- Avatar circular con letra del usuario
- Marca de "Interno" si aplica
- Formulario de respuesta (solo si estado = PENDIENTE_CLIENTE)
- Contador de caracteres
- Botón "Enviar respuesta" con animación

#### Diseño

- Gradiente de fondo moderno
- Cards con sombras sutiles
- Border radius redondeados
- Spacing consistente
- Transiciones suaves

---

## Características UX/UI

### Diseño Moderno

✅ Gradientes elegantes
✅ Colores corporativos (azul predominante)
✅ Tipografía clara y legible
✅ Espaciado generoso

### Responsive

✅ Mobile first approach
✅ Breakpoints SM, MD, LG, XL
✅ Tabla scrollable en móvil
✅ Botones táctiles en móvil

### Accesibilidad

✅ Alt text en íconos
✅ Colores accesibles (WCAG AA)
✅ Labels asociados a inputs
✅ Keyboard navigation ready

### Performance

✅ Componentes ligeros
✅ Carga lazy de imágenes
✅ Animaciones optimizadas
✅ CSS-in-JS sin duplicados

### Estados de Interacción

✅ Loading skeletons
✅ Empty states elegantes
✅ Error messages claros
✅ Success feedback
✅ Disabled states en botones

---

## Flujos de Usuario

### Flujo 1: Listar y Filtrar

1. Usuario abre "Mis PQRS"
2. Se muestra skeleton mientras carga
3. Lista de PQRS con tabla responsive
4. Usuario puede:
   - Buscar por número/título
   - Filtrar por estado
   - Paginar resultados
   - Ver detalle de cualquier PQRS

### Flujo 2: Ver Detalle

1. Usuario clica en "Ver detalle"
2. Se carga información de la PQRS
3. Muestra:
   - Información general
   - Timeline de cambios
   - Comentarios
4. Si estado = PENDIENTE_CLIENTE:
   - Aparece formulario para responder
   - Usuario puede escribir respuesta
   - Respuesta se envía y aparece en chat

### Flujo 3: Responder (condicional)

1. PQRS con estado PENDIENTE_CLIENTE
2. Tab de comentarios muestra formulario
3. Usuario escribe respuesta
4. Clica "Enviar respuesta"
5. Respuesta aparece en chat
6. Se actualiza timeline
7. Estado puede cambiar automáticamente

---

## Estructura de Datos

### PQRS Listado

```typescript
interface PQRS {
  pqrs_id: number;
  pqrs_numero: string;
  pqrs_titulo: string;
  pqrs_descripcion?: string;
  pqrs_fecha_creacion: string;
  pqrs_estado: string;
  pqrs_estado_id?: number;
  pqrs_pt_id?: number;
  tipo?: { pt_nombre: string };
  estado?: { pe_nombre: string; pe_color?: string };
}
```

### PQRS Detalle

```typescript
interface PQRSDetalle {
  pqrs_id: number;
  pqrs_numero: string;
  pqrs_titulo: string;
  pqrs_descripcion: string;
  pqrs_estado: string;
  pqrs_fecha_creacion: string;
  pqrs_fecha_cierre?: string;
  solicitante_nombre?: string;
  tipo?: { pt_nombre: string };
  prioridad?: string;
  sla_estado?: string;
  horas_para_vencimiento?: number;
}
```

### Comentario

```typescript
interface Comentario {
  pc_id?: number;
  pc_comentario?: string;
  pc_usuario?: string;
  pc_fecha?: string;
  pc_es_interno?: boolean;
}
```

---

## APIs Utilizadas

Del servicio `pqrsService`:

- `getListado(params?)` - Lista de PQRS del usuario
- `getById(id)` - Detalle completo de PQRS
- `getComentarios(pqrsId)` - Comentarios de una PQRS
- `getHistorial(pqrsId)` - Timeline de eventos
- `addComentario(pqrsId, comentario, esInterno)` - Agregar comentario
- `getTipos()` - Tipos de PQRS disponibles
- `getEstados()` - Estados disponibles

---

## Configuración y Personalización

### Cambiar items por página

En `src/app/pqrs/mis-pqrs/page.tsx`:

```typescript
const ITEMS_PER_PAGE = 10; // Cambiar este valor
```

### Cambiar colores de estados

En `src/components/pqrs/StateBadge.tsx`:

```typescript
const ESTADO_CONFIG: Record<string, ...> = {
  // Agregar o modificar estados aquí
}
```

### Formato de fechas

Se usa `date-fns` con locale es-CO. Está configurado automáticamente en:

- Timeline: `format(date, "PPp", { locale: es })`
- Listado: `toLocaleDateString("es-CO")`

---

## Notas Importantes

1. **Autenticación**: Todos los componentes usan `AuthContext` para obtener usuario
2. **Permisos**: El botón responder solo aparece si `estado === "PENDIENTE_CLIENTE"`
3. **Performance**: Las consultas paralelas con `Promise.all` optimizan carga
4. **Scroll automático**: En comentarios, el scroll baja automáticamente al agregar uno nuevo
5. **Formato de fecha**: Se adapta al locale del navegador (es-CO)

---

## Próximas Mejoras (Opcional)

- [ ] Soporte para adjuntos (descargar/subir)
- [ ] Impresión de PQRS
- [ ] Exportar a PDF
- [ ] Notificaciones en tiempo real
- [ ] Avatar dinámico del usuario
- [ ] Búsqueda avanzada
- [ ] Historial de cambios más detallado
- [ ] SLA indicator visual
- [ ] Assignments (asignar a otros)

---

**Creado**: 2026-05-10
**Versión**: 1.0
**Status**: ✅ Implementación completa
