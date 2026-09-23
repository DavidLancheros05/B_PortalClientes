// Versión del formulario con la que se crea una solicitud (nueva o de
// ampliación de cupo). Exactamente un formulario activo, con su versión
// activa marcada: sin caer a MAX(versión) ni escoger el primero si hay
// varios activos.
export async function obtenerVersionFormularioActivo(db: {
  query: (sql: string, params?: any[]) => Promise<any>;
}): Promise<number> {
  const formulariosActivos = await db.query(`
    SELECT frs_id, frs_version_activa
    FROM Formularios_solicitudes
    WHERE frs_activo = 1
  `);
  if (formulariosActivos.length !== 1) {
    throw new Error(
      `Debe haber exactamente un formulario activo en Formularios_solicitudes (hay ${formulariosActivos.length}).`,
    );
  }
  if (formulariosActivos[0].frs_version_activa == null) {
    throw new Error(
      `El formulario activo (frs_id ${formulariosActivos[0].frs_id}) no tiene frs_version_activa.`,
    );
  }
  return Number(formulariosActivos[0].frs_version_activa);
}
