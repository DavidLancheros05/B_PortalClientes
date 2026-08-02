/**
 * hash-passwords.mjs
 * Migración de datos ONE-TIME: hashea con bcrypt cualquier password que
 * todavía esté en texto plano en `usuarios.usr_password` y
 * `Clientes.cli_password` (ver documentacion/autenticacion-y-seguridad-sesion.md,
 * hallazgo #1). El código de login/cambio de contraseña ya acepta ambos
 * formatos (bcrypt o texto plano) via common/utils/password.util.ts, así
 * que correr o no este script no rompe nada — solo cierra la ventana en
 * la que las contraseñas quedan legibles directamente en la BD.
 *
 * Es IDEMPOTENTE: solo toca filas donde el valor no empieza con
 * `$2a$`/`$2b$`/`$2y$` (prefijo de un hash bcrypt), así que se puede
 * correr más de una vez sin doble-hashear nada.
 *
 * Uso (desde BACKEND/):
 *   node scripts/hash-passwords.mjs            # dry-run: solo reporta cuántas filas tocaría
 *   node scripts/hash-passwords.mjs --apply    # ejecuta el UPDATE de verdad
 */

import sql from "mssql";
import bcrypt from "bcrypt";
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

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true },
};

const BCRYPT_PREFIX = /^\$2[aby]\$/;
const apply = process.argv.includes("--apply");

async function migrarTabla(pool, { tabla, idCol, passCol, etiqueta }) {
  const result = await pool.request().query(
    `SELECT ${idCol} AS id, ${passCol} AS pass FROM dbo.${tabla} WHERE ${passCol} IS NOT NULL AND ${passCol} <> ''`,
  );

  const pendientes = result.recordset.filter(
    (r) => !BCRYPT_PREFIX.test(r.pass),
  );

  console.log(
    `${etiqueta}: ${pendientes.length} de ${result.recordset.length} en texto plano.`,
  );

  if (!apply || pendientes.length === 0) return pendientes.length;

  for (const row of pendientes) {
    const hash = await bcrypt.hash(row.pass, 10);
    await pool
      .request()
      .input("id", sql.Int, row.id)
      .input("hash", sql.VarChar, hash)
      .query(`UPDATE dbo.${tabla} SET ${passCol} = @hash WHERE ${idCol} = @id`);
  }

  console.log(`${etiqueta}: ${pendientes.length} filas hasheadas.`);
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
    });
    const totalClientes = await migrarTabla(pool, {
      tabla: "Clientes",
      idCol: "cli_id",
      passCol: "cli_password",
      etiqueta: "Clientes",
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
