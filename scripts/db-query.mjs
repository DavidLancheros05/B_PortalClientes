/**
 * db-query.mjs
 * Ejecuta SQL directo contra la BD usando la config de BACKEND/.env, sin
 * tener que reescribir el boilerplate de conexión cada vez.
 *
 * Uso (desde BACKEND/):
 *   node scripts/db-query.mjs "SELECT TOP 5 * FROM solicitudes"
 *   node scripts/db-query.mjs migrations/20260712_algo.sql
 *
 * Si el argumento es una ruta a un archivo .sql existente, ejecuta su
 * contenido; si no, lo trata como SQL literal. Soporta separadores "GO"
 * (una línea sola) igual que SSMS. Imprime el resultado como JSON (o "OK"
 * si el statement no devuelve filas, ej. INSERT/UPDATE/DDL).
 */

import sql from "mssql";
import { readFileSync, existsSync } from "fs";
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

// Mismo criterio que resolveDbConfig en src/app.module.ts: primero la
// variable con sufijo del entorno (DB_HOST_DEV, ...), si no, la sin sufijo.
const appEnv = (process.env.APP_ENV || "development").toLowerCase();
const envKey =
  { development: "DEV", test: "TEST", production: "PROD" }[appEnv] ?? "DEV";
const dbEnv = (name) =>
  process.env[`${name}_${envKey}`] ?? process.env[name];

const dbConfig = {
  user: dbEnv("DB_USER"),
  password: dbEnv("DB_PASSWORD"),
  server: dbEnv("DB_HOST"),
  port: dbEnv("DB_PORT") ? Number(dbEnv("DB_PORT")) : 1433,
  database: dbEnv("DB_NAME"),
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node scripts/db-query.mjs "SELECT ..." | archivo.sql');
    process.exit(1);
  }

  const query = existsSync(arg) ? readFileSync(arg, "utf-8") : arg;

  // "GO" no es SQL: es el separador de batches de SSMS/sqlcmd. Se parte acá
  // y se manda cada batch por separado, en orden; si uno falla, no se
  // ejecutan los siguientes.
  const batches = query
    .split(/^\s*GO\s*;?\s*$/im)
    .filter((batch) => batch.trim().length > 0);

  await sql.connect(dbConfig);
  try {
    for (const [i, batch] of batches.entries()) {
      let result;
      try {
        result = await sql.query(batch);
      } catch (err) {
        if (batches.length > 1) {
          err.message = `Batch ${i + 1}/${batches.length}: ${err.message}`;
        }
        throw err;
      }
      const recordset = Array.isArray(result.recordset)
        ? result.recordset
        : result.recordsets?.[0];
      if (batches.length > 1) console.log(`-- Batch ${i + 1}/${batches.length}`);
      console.log(JSON.stringify(recordset ?? { ok: true }, null, 2));
    }
  } finally {
    await sql.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
