#!/usr/bin/env node
/**
 * Ola 3 de documentacion/plan-solucion-autorizacion-endpoints.md.
 *
 * Escanea todos los *.controller.ts de src/ y, para cada método
 * @Post/@Put/@Patch/@Delete, verifica que declare al menos uno de:
 * @RequierePermiso(...), @Public(), @Roles(...), @SoloAutenticado()
 * (a nivel de método o de clase). Si no declara ninguno, es un endpoint de
 * mutación sin que nadie haya decidido a propósito su autorización — el
 * mismo patrón que dejó a MaestrosController expuesto sin login (ver
 * documentacion/auditoria-permisos-endpoints-backend.md).
 *
 * No reemplaza revisar el código — es un análisis estático simple por
 * regex sobre los decoradores, no entiende el árbol de sintaxis real. Basta
 * para su propósito: detectar "nadie puso ningún decorador de
 * autorización", no evaluar si el que se puso es el correcto.
 *
 * Uso:
 *   node scripts/check-permisos-endpoints.mjs            # imprime hallazgos
 *   node scripts/check-permisos-endpoints.mjs --json      # salida JSON
 *   node scripts/check-permisos-endpoints.mjs --update-baseline
 *       # reescribe scripts/permisos-endpoints-baseline.json con los
 *       # hallazgos actuales (usar solo tras revisar cada gap nuevo).
 *
 * El exit code es 0 si no hay gaps NUEVOS respecto al baseline, 1 si los
 * hay — pensado para correr en `npm test`/CI sin bloquear en toda la deuda
 * ya conocida, solo en regresiones nuevas.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASELINE_PATH = resolve(__dirname, 'permisos-endpoints-baseline.json');

function encontrarControllers(dir) {
  const resultado = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const rutaCompleta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      resultado.push(...encontrarControllers(rutaCompleta));
    } else if (entrada.isFile() && entrada.name.endsWith('.controller.ts')) {
      resultado.push(rutaCompleta);
    }
  }
  return resultado;
}

const MUTATION_DECORATORS = ['@Post(', '@Put(', '@Patch(', '@Delete('];
const AUTORIZACION_MARKERS = [
  '@RequierePermiso(',
  '@Public(',
  '@Roles(',
  '@SoloAutenticado(',
];

function esLineaDecoradorOComentario(linea) {
  const t = linea.trim();
  return (
    t === '' ||
    t.startsWith('@') ||
    t.startsWith('//') ||
    t.startsWith('*') ||
    t.startsWith('/*')
  );
}

function analizarArchivo(rutaAbsoluta) {
  const contenido = readFileSync(rutaAbsoluta, 'utf-8');
  const lineas = contenido.split('\n');

  // Decoradores de clase: todo lo que hay entre el último `export class` y
  // el `@Controller(` que lo precede inmediatamente arriba (heurística
  // simple: miramos hacia atrás desde `export class` mientras sean líneas
  // de decorador/comentario).
  const idxClase = lineas.findIndex((l) => /export class \w+/.test(l));
  let decoradoresClase = [];
  if (idxClase !== -1) {
    let i = idxClase - 1;
    while (i >= 0 && esLineaDecoradorOComentario(lineas[i])) {
      decoradoresClase.push(lineas[i]);
      i--;
    }
  }
  const claseTieneMarcador = AUTORIZACION_MARKERS.some((m) =>
    decoradoresClase.some((l) => l.includes(m)),
  );

  const gaps = [];
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const esMutacion = MUTATION_DECORATORS.some((d) => linea.includes(d));
    if (!esMutacion) continue;

    // Recolecta decoradores contiguos alrededor de esta línea (arriba y
    // abajo) hasta la firma del método, para no depender del orden en que
    // se escribieron los decoradores.
    const bloque = [linea];
    let j = i - 1;
    while (j >= 0 && esLineaDecoradorOComentario(lineas[j])) {
      bloque.push(lineas[j]);
      j--;
    }
    let k = i + 1;
    while (k < lineas.length && esLineaDecoradorOComentario(lineas[k])) {
      bloque.push(lineas[k]);
      k++;
    }

    const tieneMarcador =
      claseTieneMarcador ||
      AUTORIZACION_MARKERS.some((m) => bloque.some((l) => l.includes(m)));

    if (!tieneMarcador) {
      const rutaMatch = linea.match(/@\w+\('?([^')]*)'?\)/);
      gaps.push({
        archivo: relative(ROOT, rutaAbsoluta).replace(/\\/g, '/'),
        linea: i + 1,
        decorador: linea.trim(),
        rutaParcial: rutaMatch ? rutaMatch[1] : '',
      });
    }
  }
  return gaps;
}

function main() {
  const args = process.argv.slice(2);
  const modoJson = args.includes('--json');
  const actualizarBaseline = args.includes('--update-baseline');

  const archivos = encontrarControllers(resolve(ROOT, 'src'));
  const gaps = archivos.flatMap(analizarArchivo).sort((a, b) =>
    a.archivo === b.archivo ? a.linea - b.linea : a.archivo.localeCompare(b.archivo),
  );

  if (actualizarBaseline) {
    writeFileSync(BASELINE_PATH, JSON.stringify(gaps, null, 2) + '\n');
    console.log(`Baseline actualizado con ${gaps.length} endpoints pendientes en ${BASELINE_PATH}`);
    return;
  }

  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))
    : [];
  const clave = (g) => `${g.archivo}:${g.linea}`;
  const baselineClaves = new Set(baseline.map(clave));
  const nuevos = gaps.filter((g) => !baselineClaves.has(clave(g)));

  if (modoJson) {
    console.log(JSON.stringify({ totalGaps: gaps.length, nuevos }, null, 2));
  } else {
    console.log(
      `${gaps.length} endpoint(s) de mutación sin @RequierePermiso/@Public/@Roles/@SoloAutenticado (${baseline.length} ya conocidos en el baseline, deuda existente).`,
    );
    if (nuevos.length > 0) {
      console.log('\nNUEVOS (no estaban en el baseline — revisar antes de mergear):');
      for (const g of nuevos) {
        console.log(`  ${g.archivo}:${g.linea}  ${g.decorador}`);
      }
    }
  }

  process.exit(nuevos.length > 0 ? 1 : 0);
}

main();
