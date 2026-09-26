import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

// Formato del Sistema Comercial para usuarios.usr_password
// (LoginController.GetSHA256 en CartoneraNacional): SHA-256 de los bytes
// ASCII de la contraseña, en hex minúsculas, sin sal. .NET ASCIIEncoding
// cambia cada carácter no ASCII (ñ, tildes...) por '?', así que "Año" se
// hashea como "A?o"; se replica igual o esos usuarios no podrían entrar.
// Los usuarios internos entran a ambos sistemas con la misma contraseña:
// ver Login permisos/acceso-cliente-al-aprobar-comercial.md.
export function hashComercial(password: string): string {
  const ascii = Array.from(password, (c) =>
    c.codePointAt(0)! > 0x7f ? '?' : c,
  ).join('');
  return crypto
    .createHash('sha256')
    .update(Buffer.from(ascii, 'latin1'))
    .digest('hex');
}

export function esHashComercial(almacenada: string): boolean {
  return /^[0-9a-f]{64}$/i.test(almacenada);
}

// Compara contra cualquiera de los formatos que puede tener la columna:
// SHA-256 del Comercial, bcrypt (`$2a$`/`$2b$`/`$2y$`, clientes) o texto
// plano (cuentas viejas del portal, antes de cifrar — ver
// autenticacion-y-seguridad-sesion.md, hallazgo #1).
export async function passwordCoincide(
  passwordIngresada: string,
  almacenada: string | null | undefined,
): Promise<boolean> {
  if (!almacenada) return false;
  if (/^\$2[aby]\$/.test(almacenada)) {
    return bcrypt.compare(passwordIngresada, almacenada);
  }
  if (esHashComercial(almacenada)) {
    return crypto.timingSafeEqual(
      Buffer.from(hashComercial(passwordIngresada), 'hex'),
      Buffer.from(almacenada.toLowerCase(), 'hex'),
    );
  }
  return almacenada === passwordIngresada;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, await bcrypt.genSalt(10));
}

// Mismo alfabeto que PasswordCliente.Generar() del Sistema Comercial (sin
// 0/O, 1/l/I, que se confunden al leerlos en un correo).
const ALFABETO_PASSWORD =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

// Contraseña aleatoria para enviar por correo. Antes era
// Math.random().toString(36), que no es criptográficamente seguro.
export function generarPasswordAleatoria(longitud = 10): string {
  let resultado = '';
  for (let i = 0; i < longitud; i++) {
    resultado += ALFABETO_PASSWORD[crypto.randomInt(ALFABETO_PASSWORD.length)];
  }
  return resultado;
}
