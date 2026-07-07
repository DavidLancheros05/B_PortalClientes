/**
 * update-db-docs.mjs
 * Genera automáticamente db_columns.csv, db_rows.csv y db_usage.csv
 * consultando SQL Server con la config del BACKEND/.env
 *
 * Uso: node BACKEND/scripts/update-db-docs.mjs
 *  (desde la raíz del proyecto)
 */

import sql from "mssql";
import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, "..");
const PROJECT_ROOT = resolve(BACKEND_ROOT, "..");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "tareas ia");

// Leer BACKEND/.env sin dependencias extra
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
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "123456",
  server: process.env.DB_HOST || process.env.DB_SERVER || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME || "SistemaComercial",
  options: { encrypt: false, trustServerCertificate: true },
};

function toCsv(rows, columns) {
  const header = columns.join(",");
  const body = rows
    .map((row) =>
      columns.map((c) => JSON.stringify(row[c] ?? "")).join(",")
    )
    .join("\n");
  return header + "\n" + body + "\n";
}

async function main() {
  console.log("🔌 Conectando a SQL Server...");
  const pool = await sql.connect(dbConfig);

  // ── db_columns.csv ──────────────────────────────────────────────────────────
  console.log("📋 Generando db_columns.csv...");
  const colResult = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_CATALOG = DB_NAME()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);
  const columnsPath = resolve(OUTPUT_DIR, "db_columns.csv");
  writeFileSync(
    columnsPath,
    toCsv(colResult.recordset, ["TABLE_NAME", "COLUMN_NAME", "DATA_TYPE", "IS_NULLABLE"]),
    "utf-8"
  );
  console.log(`   ✅ ${colResult.recordset.length} columnas → ${columnsPath}`);

  // ── db_rows.csv ──────────────────────────────────────────────────────────────
  console.log("📊 Generando db_rows.csv...");
  const rowResult = await pool.request().query(`
    SELECT
      t.TABLE_NAME,
      p.row_count AS ROW_COUNT
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN sys.tables st ON st.name = t.TABLE_NAME
    JOIN sys.dm_db_partition_stats p
      ON p.object_id = st.object_id AND p.index_id IN (0,1)
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY t.TABLE_NAME
  `);
  const rowsPath = resolve(OUTPUT_DIR, "db_rows.csv");
  writeFileSync(
    rowsPath,
    toCsv(rowResult.recordset, ["TABLE_NAME", "ROW_COUNT"]),
    "utf-8"
  );
  console.log(`   ✅ ${rowResult.recordset.length} tablas → ${rowsPath}`);

  // ── db_usage.csv ─────────────────────────────────────────────────────────────
  console.log("📦 Generando db_usage.csv...");
  const usageResult = await pool.request().query(`
    SELECT
      t.TABLE_NAME AS table_name,
      p.row_count,
      (au.total_pages * 8) AS space_used_kb,
      (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_NAME = t.TABLE_NAME AND c.TABLE_CATALOG = DB_NAME()
      ) AS column_count,
      (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          ON rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = t.TABLE_NAME
      ) AS foreign_key_count
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN sys.tables st ON st.name = t.TABLE_NAME
    JOIN sys.dm_db_partition_stats p
      ON p.object_id = st.object_id AND p.index_id IN (0,1)
    JOIN sys.indexes i
      ON i.object_id = st.object_id AND i.index_id IN (0,1)
    JOIN sys.partitions pt
      ON pt.object_id = st.object_id AND pt.index_id = i.index_id
    JOIN sys.allocation_units au
      ON au.container_id = pt.partition_id
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY t.TABLE_NAME
  `);
  const usagePath = resolve(OUTPUT_DIR, "db_usage.csv");
  writeFileSync(
    usagePath,
    toCsv(usageResult.recordset, [
      "table_name",
      "row_count",
      "space_used_kb",
      "column_count",
      "foreign_key_count",
    ]),
    "utf-8"
  );
  console.log(`   ✅ ${usageResult.recordset.length} tablas → ${usagePath}`);

  await pool.close();
  console.log("\n✅ Todos los archivos actualizados.");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
