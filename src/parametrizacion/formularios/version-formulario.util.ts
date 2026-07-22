// Regla compartida de "¿esta versión del formulario ya tiene solicitudes
// reales asociadas?" — usada tanto para bloquear la edición de
// preguntas/opciones (assertVersionSinSolicitudes en opciones.service.ts y
// formulario-preguntas.service.ts) como para el aviso en pantalla
// (FormulariosService.getFormularioCompleto, tiene_solicitudes).
//
// Un Borrador (sol_estado_id = 1) no cuenta: todavía no generó ningún PDF
// ni fue visto por nadie más que el propio cliente, así que no hay nada que
// se rompa si se edita la versión. Recién a partir de Pendiente/Revisión/
// Completada/Aprobada/Rechazada hay algo real en juego.
//
// FormulariosService.obtenerVersiones() necesita este mismo conteo por
// CADA versión a la vez (para listar todas en la pantalla de "Gestionar
// versiones"), así que ahí va como subquery correlacionada dentro de una
// sola consulta en vez de llamar a esta función en un loop — si se toca la
// condición acá, hay que replicar el cambio en esa subquery también.
export async function contarSolicitudesQueBloqueanVersion(
  queryable: { query: (sql: string, params?: any[]) => Promise<any[]> },
  versionNumero: number,
): Promise<number> {
  const result = await queryable.query(
    `SELECT COUNT(*) AS total FROM solicitudes WHERE sol_formulario_version = @0 AND sol_estado_id <> 1`,
    [versionNumero],
  );
  return Number(result[0]?.total ?? 0);
}
