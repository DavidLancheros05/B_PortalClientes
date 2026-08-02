import * as bcrypt from 'bcrypt';

// Compara contra hash bcrypt si la columna ya está migrada
// (`$2a$`/`$2b$`/`$2y$`), o en texto plano si todavía no (cuentas creadas
// antes de la migración a bcrypt — ver
// documentacion/autenticacion-y-seguridad-sesion.md, hallazgo #1). Así el
// login/cambio de contraseña no se rompe para cuentas que no han pasado
// por scripts/hash-passwords.mjs todavía.
export async function passwordCoincide(
  passwordIngresada: string,
  almacenada: string | null | undefined,
): Promise<boolean> {
  if (!almacenada) return false;
  if (/^\$2[aby]\$/.test(almacenada)) {
    return bcrypt.compare(passwordIngresada, almacenada);
  }
  return almacenada === passwordIngresada;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, await bcrypt.genSalt(10));
}
