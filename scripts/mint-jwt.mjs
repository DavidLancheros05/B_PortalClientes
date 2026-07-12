/**
 * mint-jwt.mjs
 * Genera un JWT de prueba firmado con el JWT_SECRET de BACKEND/.env, para
 * probar endpoints con curl sin pasar por el login real.
 *
 * Uso (desde BACKEND/):
 *   node scripts/mint-jwt.mjs ADMIN
 *   node scripts/mint-jwt.mjs CLIENTE 13603
 *
 * El payload que espera JwtStrategy (src/auth/jwt.strategy.ts) es
 * { usr_id, email, rol, cliente_id }. Para rol CLIENTE, usr_id y
 * cliente_id normalmente son el mismo cli_id (ver auth.service.ts).
 */

import jwt from "jsonwebtoken";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(__dirname, "..");

function loadEnv(envPath) {
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
}

loadEnv(resolve(BACKEND_ROOT, ".env"));

const rol = process.argv[2] || "ADMIN";
const idArg = process.argv[3] ? Number(process.argv[3]) : 1;

const payload =
  rol === "CLIENTE"
    ? { usr_id: idArg, cliente_id: idArg, rol: "CLIENTE", email: "test@test.com" }
    : { usr_id: idArg, cliente_id: null, rol, email: "test@test.com" };

const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" });
console.log(token);
