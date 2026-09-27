/**
 * migrar-respuestas-tabla-a-codigo.mjs
 *
 * Fase 4 de "documentacion/Portal Clientes/Formularios/
 * plan-correccion-modelo-datos-formulario.md": reescribe las respuestas de
 * preguntas TABLA (Formulario_respuesta.fr_valor_texto) para que cada celda
 * quede bajo el `codigo` de su columna en vez de su `nombre` visible.
 *
 * - Usa las columnas (fp_tabla_columnas) de LA PREGUNTA de cada respuesta,
 *   que es de la misma versión que la respuesta.
 * - Celda que ya está por codigo: se deja. Clave que no corresponde a
 *   ninguna columna (columna borrada): se conserva tal cual y se reporta.
 * - Es idempotente: una segunda corrida no encuentra nada que cambiar.
 *
 * Correr DESPUÉS de desplegar el frontend que lee/escribe por codigo: el
 * frontend viejo busca las celdas por nombre y las vería vacías. (El
 * backend nuevo lee ambas claves, así que no depende del orden.)
 *
 * Uso (desde Backend_portal/):
 *   node scripts/migrar-respuestas-tabla-a-codigo.mjs           # dry-run (no escribe)
 *   node scripts/migrar-respuestas-tabla-a-codigo.mjs --apply   # escribe de verdad
 */

import sql from "mssql";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, "..");

function loadEnv(envPath) {
  try {
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/#.*$/, "").trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    // usa defaults si no existe .env
  }
}

loadEnv(resolve(BACKEND_ROOT, ".env"));

// Mismo criterio que db-query.mjs / resolveDbConfig en src/app.module.ts.
const appEnv = (process.env.APP_ENV || "development").toLowerCase();
const envKey =
  { development: "DEV", test: "TEST", production: "PROD" }[appEnv] ?? "DEV";
const dbEnv = (name) => process.env[`${name}_${envKey}`] ?? process.env[name];

const dbConfig = {
  user: dbEnv("DB_USER"),
  password: dbEnv("DB_PASSWORD"),
  server: dbEnv("DB_HOST"),
  port: dbEnv("DB_PORT") ? Number(dbEnv("DB_PORT")) : 1433,
  database: dbEnv("DB_NAME"),
  requestTimeout: 60000,
  options: { encrypt: true, trustServerCertificate: true },
};

const APPLY = process.argv.includes("--apply");

// Mismo criterio que src/common/utils/tabla-respuesta.util.ts.
function parseColumnas(fpTablaColumnas) {
  if (!fpTablaColumnas) return [];
  try {
    const parsed = JSON.parse(fpTablaColumnas);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) => {
        if (typeof c === "string") return { nombre: c };
        if (c && typeof c === "object" && typeof c.nombre === "string") {
          return { nombre: c.nombre, codigo: c.codigo || undefined };
        }
        return null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function filasPorCodigo(filas, columnas) {
  const conocidas = new Set();
  for (const c of columnas) {
    conocidas.add(c.nombre);
    if (c.codigo) conocidas.add(c.codigo);
  }
  const desconocidas = new Set();
  const salida = filas.map((fila) => {
    const nueva = {};
    for (const c of columnas) {
      const v =
        c.codigo && fila?.[c.codigo] !== undefined ? fila[c.codigo] : fila?.[c.nombre];
      if (v !== undefined) nueva[c.codigo || c.nombre] = v;
    }
    for (const [k, v] of Object.entries(fila ?? {})) {
      if (!conocidas.has(k)) {
        nueva[k] = v;
        desconocidas.add(k);
      }
    }
    return nueva;
  });
  return { salida, desconocidas: [...desconocidas] };
}

async function main() {
  const pool = await sql.connect(dbConfig);
  console.log(
    `BD ${dbConfig.database} en ${dbConfig.server} — ${APPLY ? "APLICANDO" : "dry-run (sin --apply no escribe)"}`,
  );

  const { recordset } = await pool.request().query(`
    SELECT r.fr_id, r.fr_sol_id, r.fr_valor_texto, p.fp_id, p.fp_codigo, p.fp_tabla_columnas
    FROM Formulario_respuesta r
    JOIN Formulario_pregunta p ON p.fp_id = r.fr_fp_id
    WHERE p.fp_tipo = 'TABLA' AND r.fr_valor_texto IS NOT NULL
  `);

  let cambiadas = 0;
  let iguales = 0;
  let invalidas = 0;
  const avisos = [];
  const cambios = [];

  for (const r of recordset) {
    let filas;
    try {
      filas = JSON.parse(r.fr_valor_texto);
    } catch {
      invalidas++;
      avisos.push(`fr_id ${r.fr_id}: fr_valor_texto no es JSON, se deja igual`);
      continue;
    }
    if (!Array.isArray(filas)) {
      invalidas++;
      avisos.push(`fr_id ${r.fr_id}: el JSON no es una lista de filas, se deja igual`);
      continue;
    }
    const columnas = parseColumnas(r.fp_tabla_columnas);
    const sinCodigo = columnas.filter((c) => !c.codigo).map((c) => c.nombre);
    if (sinCodigo.length) {
      avisos.push(
        `fr_id ${r.fr_id} (fp ${r.fp_codigo}): columnas sin codigo, quedan por nombre: ${sinCodigo.join(", ")}`,
      );
    }
    const { salida, desconocidas } = filasPorCodigo(filas, columnas);
    if (desconocidas.length) {
      avisos.push(
        `fr_id ${r.fr_id} (sol ${r.fr_sol_id}, fp ${r.fp_codigo}): claves sin columna, se conservan: ${desconocidas.join(", ")}`,
      );
    }
    const nuevoTexto = JSON.stringify(salida);
    if (nuevoTexto === JSON.stringify(filas)) {
      iguales++;
      continue;
    }
    cambiadas++;
    cambios.push({ fr_id: r.fr_id, nuevoTexto });
    if (cambiadas <= 3) {
      console.log(`\nfr_id ${r.fr_id} (fp ${r.fp_codigo})`);
      console.log(`  antes:   ${r.fr_valor_texto.slice(0, 160)}`);
      console.log(`  después: ${nuevoTexto.slice(0, 160)}`);
    }
  }

  if (APPLY && cambios.length) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const c of cambios) {
        await new sql.Request(tx)
          .input("id", sql.Int, c.fr_id)
          .input("txt", sql.VarChar(sql.MAX), c.nuevoTexto)
          .query(`UPDATE Formulario_respuesta SET fr_valor_texto = @txt WHERE fr_id = @id`);
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  }

  console.log(
    `\nRespuestas TABLA: ${recordset.length} | a cambiar: ${cambiadas} | ya por codigo: ${iguales} | inválidas: ${invalidas}`,
  );
  if (avisos.length) {
    console.log(`\nAvisos (${avisos.length}):`);
    for (const a of avisos) console.log(`  - ${a}`);
  }
  if (!APPLY && cambiadas) console.log("\nNada escrito. Correr con --apply para aplicar.");
  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
