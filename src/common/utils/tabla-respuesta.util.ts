// Respuestas de preguntas TABLA (Formulario_respuesta.fr_valor_texto): un JSON
// con un objeto por fila. Desde la Fase 4 de
// plan-correccion-modelo-datos-formulario.md cada celda se guarda bajo el
// `codigo` de su columna (estable ante renombrados), no bajo su `nombre`
// visible. Las respuestas viejas pueden seguir por nombre, así que toda
// lectura acepta ambas claves: `codigo` primero, `nombre` de respaldo.

export interface ColumnaTablaClave {
  nombre: string;
  codigo?: string;
}

type Fila = Record<string, unknown>;

// Columnas de fp_tabla_columnas. Acepta el formato viejo (array de strings).
export function parseColumnasTabla(
  fpTablaColumnas: string | null | undefined,
): ColumnaTablaClave[] {
  if (!fpTablaColumnas) return [];
  try {
    const parsed = JSON.parse(fpTablaColumnas);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c): ColumnaTablaClave | null => {
        if (typeof c === 'string') return { nombre: c };
        if (c && typeof c === 'object' && typeof c.nombre === 'string') {
          return {
            nombre: c.nombre,
            codigo:
              typeof c.codigo === 'string' && c.codigo ? c.codigo : undefined,
          };
        }
        return null;
      })
      .filter((c): c is ColumnaTablaClave => c !== null);
  } catch {
    return [];
  }
}

export function claveColumna(columna: ColumnaTablaClave): string {
  return columna.codigo || columna.nombre;
}

export function valorCelda(
  fila: Fila | null | undefined,
  columna: ColumnaTablaClave,
): unknown {
  if (!fila) return undefined;
  if (columna.codigo && fila[columna.codigo] !== undefined) {
    return fila[columna.codigo];
  }
  return fila[columna.nombre];
}

// Reescribe las filas con la clave que devuelve `clave` para cada columna.
// Las claves que no corresponden a ninguna columna (columna borrada de la
// configuración) se conservan tal cual para no perder datos.
function reclavear(
  filas: Fila[],
  columnas: ColumnaTablaClave[],
  clave: (c: ColumnaTablaClave) => string,
): Record<string, string>[] {
  const conocidas = new Set<string>();
  for (const c of columnas) {
    conocidas.add(c.nombre);
    if (c.codigo) conocidas.add(c.codigo);
  }
  return filas.map((fila) => {
    const salida: Record<string, string> = {};
    for (const c of columnas) {
      const v = valorCelda(fila, c);
      if (v !== undefined) salida[clave(c)] = v as string;
    }
    for (const [k, v] of Object.entries(fila ?? {})) {
      if (!conocidas.has(k)) salida[k] = v as string;
    }
    return salida;
  });
}

// Para mostrar (PDF, plantillas, detalle): filas por nombre visible.
export function filasPorNombre(
  filas: Fila[],
  columnas: ColumnaTablaClave[],
): Record<string, string>[] {
  return reclavear(filas, columnas, (c) => c.nombre);
}

// Para guardar: filas por codigo.
export function filasPorCodigo(
  filas: Fila[],
  columnas: ColumnaTablaClave[],
): Record<string, string>[] {
  return reclavear(filas, columnas, claveColumna);
}

// fr_valor_texto de una TABLA con sus filas por nombre visible. Si no es un
// JSON de filas, lo devuelve igual.
export function respuestaTablaPorNombre(
  frValorTexto: string | null | undefined,
  fpTablaColumnas: string | null | undefined,
): string | null | undefined {
  if (!frValorTexto) return frValorTexto;
  try {
    const filas = JSON.parse(frValorTexto);
    if (!Array.isArray(filas)) return frValorTexto;
    return JSON.stringify(
      filasPorNombre(filas, parseColumnasTabla(fpTablaColumnas)),
    );
  } catch {
    return frValorTexto;
  }
}
