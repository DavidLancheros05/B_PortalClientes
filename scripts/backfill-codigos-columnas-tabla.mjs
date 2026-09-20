/**
 * backfill-codigos-columnas-tabla.mjs
 *
 * Corrida única (ver "Documentos Cartonera/documentacion/Funcionalidades/
 * codigo-estable-columnas-tabla.md"): recorre todas las Formulario_pregunta
 * tipo TABLA (todas las versiones) y le asigna a cada columna de
 * fp_tabla_columnas un `codigo` estable si todavía no lo tiene.
 *
 * - Columnas cuyo `nombre` actual coincide con un alias conocido en MAPEOS
 *   (misma lista que cliente-datos-normalizados.service.ts, duplicada acá
 *   a propósito — ver nota abajo) reciben el `codigo` determinístico igual
 *   al nombre de la columna destino (ej. "cde_direccion"), que es
 *   exactamente lo que ese servicio ya busca por convención.
 * - El resto de columnas TABLA (sin mapeo a SIESA) reciben un `codigo`
 *   genérico aleatorio, para que "toda columna tiene codigo" sea una
 *   propiedad general, no solo de las mapeadas hoy.
 * - Columnas que ya traen `codigo` (guardadas después del deploy del
 *   autogenerado en formulario-preguntas.service.ts) se dejan intactas.
 *
 * NOTA sobre la duplicación: MAPEOS acá es una copia deliberadamente
 * reducida (fpCodigo + aliases + columna destino) de la de
 * cliente-datos-normalizados.service.ts, solo para poder correr este
 * script sin transpilar TypeScript. Si se vuelve a correr este script en
 * el futuro (ej. tras agregar un mapeo nuevo), actualizar esta copia a
 * mano para que coincida — no hay una fuente única compartida entre JS
 * suelto y el código del backend.
 *
 * Uso (desde BACKEND/):
 *   node scripts/backfill-codigos-columnas-tabla.mjs           # dry-run (no escribe)
 *   node scripts/backfill-codigos-columnas-tabla.mjs --apply   # escribe de verdad
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

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 1433,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true },
};

// Copia reducida de MAPEOS (cliente-datos-normalizados.service.ts) — solo
// lo necesario para decidir el `codigo` determinístico de cada columna.
const MAPEOS = [
  {
    fpCodigo: "AUTO_Q1231",
    campos: [
      { aliases: ["Pais"], columna: "cde_pai_id" },
      { aliases: ["Departamento"], columna: "cde_dpto_id" },
      { aliases: ["Ciudad"], columna: "cde_ciu_id" },
      { aliases: ["Direccion"], columna: "cde_direccion" },
      { aliases: ["Zona Franca"], columna: "cde_zona_franca" },
      { aliases: ["Horario"], columna: "cde_horario" },
    ],
  },
  {
    fpCodigo: "REP_LEGAL_TABLA",
    campos: [
      { aliases: ["Apellidos y Nombre"], columna: "crl_nombre" },
      { aliases: ["Identificacion"], columna: "crl_identificacion" },
      { aliases: ["Ciudad de Expedición"], columna: "crl_ciu_expedicion_id" },
      { aliases: ["Direccion"], columna: "crl_direccion" },
    ],
  },
  {
    fpCodigo: "REP_LEGAL_SUPLENTES",
    campos: [
      { aliases: ["Apellidos y Nombre"], columna: "crl_nombre" },
      { aliases: ["Identificacion"], columna: "crl_identificacion" },
      { aliases: ["Ciudad de Expedición"], columna: "crl_ciu_expedicion_id" },
      { aliases: ["Direccion"], columna: "crl_direccion" },
    ],
  },
  {
    // Real en la BD es 'ACCIONISTAS_TABLA', no 'AUTO_Q2659' — ver el fix
    // del mismo bug en cliente-datos-normalizados.service.ts (2026-09-14).
    fpCodigo: "ACCIONISTAS_TABLA",
    campos: [
      { aliases: ["Nombre Completo / Razón Social"], columna: "cac_nombre_razon_social" },
      { aliases: ["Tipo de Identificación"], columna: "cac_tid_id" },
      { aliases: ["No. Identificación"], columna: "cac_no_identificacion" },
      { aliases: ["% Participáción", "% Participación"], columna: "cac_porcentaje_participacion" },
    ],
  },
  {
    fpCodigo: "AUTO_Q2651",
    campos: [
      { aliases: ["Nombre"], columna: "cca_nombre" },
      { aliases: ["Cargo"], columna: "cca_cargo" },
      { aliases: ["Telefono"], columna: "cca_telefono" },
      { aliases: ["Correo electronico"], columna: "cca_correo" },
    ],
  },
  {
    fpCodigo: "AUTO_Q2671",
    campos: [
      { aliases: ["Nombre"], columna: "cbc_nombre" },
      { aliases: ["Identificacion"], columna: "cbc_identificacion" },
      { aliases: ["Direccion"], columna: "cbc_direccion" },
    ],
  },
  {
    fpCodigo: "AUTO_Q2661",
    campos: [
      { aliases: ["Nombre"], columna: "cfe_nombre" },
      { aliases: ["Cargo"], columna: "cfe_cargo" },
      { aliases: ["Correo electronico"], columna: "cfe_correo" },
    ],
  },
  {
    fpCodigo: "AUTO_Q2675",
    campos: [
      { aliases: ["Nombre Persona a contactar", "Nombre"], columna: "crc_nombre_contacto" },
      { aliases: ["Telefono"], columna: "crc_telefono" },
      { aliases: ["Correo"], columna: "crc_correo" },
      { aliases: ["Cupo credito"], columna: "crc_cupo_credito" },
    ],
  },
  {
    fpCodigo: "AUTO_Q2676",
    campos: [
      { aliases: ["Nombre"], columna: "crb_nombre_banco" },
      { aliases: ["Sucursal"], columna: "crb_sucursal" },
      { aliases: ["Cuenta No."], columna: "crb_cuenta_no" },
      { aliases: ["Telefono"], columna: "crb_telefono" },
    ],
  },
];

const mapeoPorFpCodigo = new Map(MAPEOS.map((m) => [m.fpCodigo, m]));

function resolverCodigoDeterministico(fpCodigo, nombreColumna) {
  const mapeo = mapeoPorFpCodigo.get(fpCodigo);
  if (!mapeo) return null;
  const campo = mapeo.campos.find((c) => c.aliases.includes(nombreColumna));
  return campo?.columna ?? null;
}


async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODO: --apply (va a escribir)" : "MODO: dry-run (no escribe, agregá --apply para escribir)");

  await sql.connect(dbConfig);
  try {
    const result = await sql.query(
      `SELECT fp_id, fp_codigo, fp_version, fp_tabla_columnas
       FROM Formulario_pregunta
       WHERE fp_tipo = 'TABLA' AND fp_tabla_columnas IS NOT NULL`,
    );

    const preguntas = result.recordset;
    console.log(`Preguntas TABLA con columnas: ${preguntas.length}`);

    let preguntasActualizadas = 0;
    let columnasConCodigoNuevo = 0;
    let columnasYaTenianCodigo = 0;

    for (const p of preguntas) {
      let columnas;
      try {
        const parsed = JSON.parse(p.fp_tabla_columnas);
        if (!Array.isArray(parsed)) {
          console.warn(`fp_id=${p.fp_id}: fp_tabla_columnas no es un array, se omite`);
          continue;
        }
        columnas = parsed;
      } catch {
        console.warn(`fp_id=${p.fp_id}: fp_tabla_columnas no es JSON válido, se omite`);
        continue;
      }

      // Consecutivo por pregunta ("1", "2", ...) para columnas sin mapeo a
      // SIESA — mismo criterio que asegurarCodigosColumnasTabla en
      // formulario-preguntas.service.ts (no aleatorio, arranca desde el
      // máximo código puramente numérico ya presente en este array).
      let consecutivo = 0;
      for (const c of columnas) {
        const codigo = typeof c === "object" && c ? c.codigo : undefined;
        if (typeof codigo === "string" && /^\d+$/.test(codigo)) {
          consecutivo = Math.max(consecutivo, Number(codigo));
        }
      }

      let cambio = false;
      const columnasConCodigo = columnas.map((c) => {
        const columna = typeof c === "string" ? { nombre: c, tipo: "TEXTO" } : { ...c };
        if (columna.codigo) {
          columnasYaTenianCodigo++;
          return columna;
        }
        const codigoDeterministico = resolverCodigoDeterministico(p.fp_codigo, columna.nombre);
        if (codigoDeterministico) {
          columna.codigo = codigoDeterministico;
        } else {
          consecutivo++;
          columna.codigo = String(consecutivo);
        }
        cambio = true;
        columnasConCodigoNuevo++;
        return columna;
      });

      if (!cambio) continue;

      preguntasActualizadas++;
      const nuevoJson = JSON.stringify(columnasConCodigo);
      console.log(
        `fp_id=${p.fp_id} fp_codigo=${p.fp_codigo ?? "(sin código)"} fp_version=${p.fp_version}: ` +
          columnasConCodigo.map((c) => `${c.nombre} -> ${c.codigo}`).join(", "),
      );

      if (apply) {
        const request = new sql.Request();
        request.input("fpTablaColumnas", sql.NVarChar(sql.MAX), nuevoJson);
        request.input("fpId", sql.Int, p.fp_id);
        await request.query(
          `UPDATE Formulario_pregunta SET fp_tabla_columnas = @fpTablaColumnas WHERE fp_id = @fpId`,
        );
      }
    }

    console.log("---");
    console.log(`Preguntas actualizadas: ${preguntasActualizadas}`);
    console.log(`Columnas con código nuevo: ${columnasConCodigoNuevo}`);
    console.log(`Columnas que ya tenían código: ${columnasYaTenianCodigo}`);
    if (!apply) {
      console.log("Dry-run: no se escribió nada. Correr con --apply para aplicar.");
    }
  } finally {
    await sql.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
