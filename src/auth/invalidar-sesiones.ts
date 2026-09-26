import { olvidarVersion } from './version-sesion-cache';

// Cierra todas las sesiones abiertas de una cuenta: sube la versión de token
// (claim `tv` del JWT) y JwtAuthGuard rechaza cualquier token anterior.
// Función suelta (no un método de AuthService) para que otros módulos
// (Seguridad → Usuarios, Usuario-roles) la usen sin importar AuthModule.
export async function invalidarSesionesCuenta(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  tipo: 'cliente' | 'usuario',
  id: number,
): Promise<void> {
  const tabla = tipo === 'cliente' ? 'Clientes' : 'usuarios';
  const idColumna = tipo === 'cliente' ? 'cli_id' : 'usr_id';
  const versionColumna =
    tipo === 'cliente' ? 'cli_token_version' : 'usr_token_version';

  await db.query(
    `UPDATE dbo.${tabla} SET ${versionColumna} = ${versionColumna} + 1 WHERE ${idColumna} = @0`,
    [id],
  );
  // Sin esto el token revocado seguiría valiendo hasta que venza la
  // caché de JwtAuthGuard.
  olvidarVersion(tipo, id);
}
