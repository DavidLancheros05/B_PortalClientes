/**
 * hash-passwords.mjs
 * Migración de datos ONE-TIME: cifra las contraseñas que todavía estén en
 * texto plano, cada tabla en SU formato:
 *   - `usuarios.usr_password`: SHA-256 del Sistema Comercial (mismo que
 *     password.util.ts::hashComercial). La tabla la comparte el Comercial y
 *     los usuarios entran a ambos con la misma contraseña: NUNCA bcrypt aquí.
 *   - `Clientes.cli_password`: bcrypt (el Comercial no tiene login de
 *     clientes).
 * Ver documentacion/Portal Clientes/Login permisos/
 * acceso-cliente-al-aprobar-comercial.md.
 *
 * Es IDEMPOTENTE: salta los valores que ya están cifrados (hex de 64 = SHA-256
 * del Comercial; `$2a/**
 * hash-passwords.mjs
/`$2b/**
 * hash-passwords.mjs
/`$2y/**
 * hash-passwords.mjs
 = bcrypt), así que no doble-cifra.
 * Ojo: antes trataba los 64 hex del Comercial como texto plano y los habría
 * cifrado encima, dejando a esos usuarios sin acceso a ambos sistemas.
 *
 * Uso (desde BACKEND/):
 *   node scripts/hash-passwords.mjs            # dry-run: solo reporta cuántas filas tocaría
 *   node scripts/hash-passwords.mjs --apply    # ejecuta el UPDATE de verdad
 */

import sql from "mssql";
import bcrypt from "bcrypt";
import { createHash } from "crypto";
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

// Mismo criterio que db-query.mjs / resolveDbConfig en src/app.module.ts:
// primero la variable con sufijo del entorno (APP_ENV → DEV/TEST/PROD), si
// no, la sin sufijo. Antes leía solo DB_HOST y fallaba sin conectar.
const appEnv = (process.env.APP_ENV || "development").toLowerCase();
const envKey =
  { development: "DEV", test: "TEST", production: "PROD" }[appEnv] ?? "DEV";
const env = (k) => process.env[`${k}_${envKey}`] ?? process.env[k];

const dbConfig = {
  user: env("DB_USER"),
  password: env("DB_PASSWORD"),
  server: env("DB_HOST"),
  port: env("DB_PORT") ? Number(env("DB_PORT")) : 1433,
  database: env("DB_NAME"),
  options: { encrypt: true, trustServerCertificate: true },
};

const BCRYPT_PREFIX = /^\$2[aby]\$/;
const HASH_COMERCIAL = /^[0-9a-f]{64}$/i;
const apply = process.argv.includes("--apply");

// Igual a password.util.ts::hashComercial (SHA-256 ASCII, no ASCII -> '?').
function hashComercial(password) {
  const ascii = Array.from(password, (c) =>
    c.codePointAt(0) > 0x7f ? "?" : c,
  ).join("");
  return createHash("sha256").update(Buffer.from(ascii, "latin1")).digest("hex");
}

async function migrarTabla(pool, { tabla, idCol, passCol, etiqueta, cifrar }) {
  const result = await pool.request().query(
    `SELECT ${idCol} AS id, ${passCol} AS pass FROM dbo.${tabla} WHERE ${passCol} IS NOT NULL AND ${passCol} <> ''`,
  );

  const pendientes = result.recordset.filter(
    (r) => !BCRYPT_PREFIX.test(r.pass) && !HASH_COMERCIAL.test(r.pass),
  );

  console.log(
    `${etiqueta}: ${pendientes.length} de ${result.recordset.length} en texto plano.`,
  );

  if (!apply || pendientes.length === 0) return pendientes.length;

  for (const row of pendientes) {
    const hash = await cifrar(row.pass);
    await pool
      .request()
      .input("id", sql.Int, row.id)
      .input("hash", sql.VarChar, hash)
      .query(`UPDATE dbo.${tabla} SET ${passCol} = @hash WHERE ${idCol} = @id`);
  }

  console.log(`${etiqueta}: ${pendientes.length} filas cifradas.`);
  return pendientes.length;
}

async function main() {
  const pool = await sql.connect(dbConfig);
  try {
    const totalUsuarios = await migrarTabla(pool, {
      tabla: "usuarios",
      idCol: "usr_id",
      passCol: "usr_password",
      etiqueta: "usuarios",
      cifrar: async (p) => hashComercial(p),
    });
    const totalClientes = await migrarTabla(pool, {
      tabla: "Clientes",
      idCol: "cli_id",
      passCol: "cli_password",
      etiqueta: "Clientes",
      cifrar: (p) => bcrypt.hash(p, 10),
    });

    if (!apply && totalUsuarios + totalClientes > 0) {
      console.log(
        "\nDry-run — no se modificó nada. Corré con --apply para hashear de verdad.",
      );
    }
  } finally {
    await sql.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
