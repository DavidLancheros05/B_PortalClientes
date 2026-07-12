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
 * contenido; si no, lo trata como SQL literal. Imprime el resultado como
 * JSON (o "OK" si el statement no devuelve filas, ej. INSERT/UPDATE/DDL).
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

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true },
};

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Uso: node scripts/db-query.mjs "SELECT ..." | archivo.sql');
    process.exit(1);
  }

  const query = existsSync(arg) ? readFileSync(arg, "utf-8") : arg;

  await sql.connect(dbConfig);
  try {
    const result = await sql.query(query);
    const recordset = Array.isArray(result.recordset)
      ? result.recordset
      : result.recordsets?.[0];
    console.log(JSON.stringify(recordset ?? { ok: true }, null, 2));
  } finally {
    await sql.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
