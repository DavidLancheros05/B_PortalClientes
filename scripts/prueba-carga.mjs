#!/usr/bin/env node
/**
 * Prueba de carga simple: N usuarios virtuales pidiendo endpoints de
 * lectura en bucle, sin pausa, durante S segundos. Imprime p50/p95/max por
 * endpoint y el total de peticiones por segundo.
 *
 * Ver documentacion/Portal Clientes/mejoras/escalabilidad-rendimiento.md
 * (sección "Prueba de carga").
 *
 * Uso:
 *   TOKEN=$(node scripts/mint-jwt.mjs ADMIN | tail -1)
 *   node scripts/prueba-carga.mjs "$TOKEN" 20 30     # 20 usuarios, 30 s
 *   P=4013 node scripts/prueba-carga.mjs "$TOKEN" 40 30   # otro puerto
 *
 * El puerto sale de P o, si no, de PORT en .env. Solo hace GETs: no
 * modifica datos. La solicitud 2205 es de "David Prueba 2".
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const [, , token, usuarios = '20', segundos = '30'] = process.argv;
if (!token) {
  console.error('Uso: node scripts/prueba-carga.mjs <token> [usuarios] [segundos]');
  process.exit(1);
}

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const puertoEnv = readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m)?.[1];
const BASE = `http://localhost:${process.env.P || puertoEnv || 3001}/api`;

const rutas = [
  '/solicitudes/listado',
  '/solicitudes/2205/respuestas',
  '/parametrizacion/formulario-preguntas',
  '/maestros/paises',
  '/solicitudes/oc/1',
];
const stats = Object.fromEntries(rutas.map((r) => [r, { t: [], err: 0 }]));
const fin = Date.now() + Number(segundos) * 1000;

async function usuario(i) {
  let k = i;
  while (Date.now() < fin) {
    const r = rutas[k++ % rutas.length];
    const t0 = performance.now();
    try {
      const res = await fetch(BASE + r, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await res.arrayBuffer();
      if (!res.ok) stats[r].err++;
      else stats[r].t.push(performance.now() - t0);
    } catch {
      stats[r].err++;
    }
  }
}

await Promise.all(
  Array.from({ length: Number(usuarios) }, (_, i) => usuario(i)),
);

const p = (a, q) =>
  (a.length
    ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] / 1000
    : 0
  ).toFixed(2);
let total = 0;
for (const [r, s] of Object.entries(stats)) {
  total += s.t.length;
  console.log(
    `${r.padEnd(40)} n=${String(s.t.length).padStart(4)} p50=${p(s.t, 0.5)}s p95=${p(s.t, 0.95)}s max=${p(s.t, 1)}s errores=${s.err}`,
  );
}
console.log(
  `TOTAL ${total} peticiones en ${segundos}s = ${(total / Number(segundos)).toFixed(1)} req/s con ${usuarios} usuarios`,
);
