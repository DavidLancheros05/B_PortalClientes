type Queryable = { query: (sql: string, params?: any[]) => Promise<any[]> };

// Regla compartida de "¿esta versión del formulario ya tiene solicitudes
// reales asociadas?" — usada tanto para bloquear la edición de
// preguntas/opciones (assertVersionSinSolicitudes en opciones.service.ts y
// formulario-preguntas.service.ts) como para el aviso en pantalla
// (FormulariosService.getFormularioCompleto, tiene_solicitudes).
//
// Un Borrador (sol_ses_id = 1) no cuenta: todavía no generó ningún PDF
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
  queryable: Queryable,
  fvId: number,
): Promise<number> {
  const result = await queryable.query(
    `SELECT COUNT(*) AS total FROM solicitudes WHERE sol_fv_id = @0 AND sol_ses_id <> 1`,
    [fvId],
  );
  return Number(result[0]?.total ?? 0);
}

// La API y las pantallas siguen hablando de "formulario X, versión N"
// (fv_numero, lo que ve el usuario); por dentro todo se amarra por fv_id.
// La pareja
// (fv_frs_id, fv_numero) es única (UQ_Formulario_versiones_frs_numero).
export async function resolverFvId(
  queryable: Queryable,
  formularioId: number,
  versionNumero: number,
): Promise<number | null> {
  const result = await queryable.query(
    `SELECT fv_id FROM Formulario_versiones WHERE fv_frs_id = @0 AND fv_numero = @1`,
    [formularioId, versionNumero],
  );
  return result[0]?.fv_id ?? null;
}

// Formulario activo + número de su versión activa, para pedir preguntas y
// secciones de "nueva solicitud" sin que el frontend tenga que resolver
// primero la versión (una petición menos en cadena). null si no hay
// formulario activo o no tiene versión activa marcada.
export async function obtenerFormularioYVersionActiva(
  queryable: Queryable,
): Promise<{ frs_id: number; fv_numero: number } | null> {
  const result = await queryable.query(`
    SELECT TOP 1 f.frs_id, v.fv_numero
    FROM Formularios_solicitudes f
    JOIN Formulario_versiones v ON v.fv_id = f.frs_fv_id_activa
    WHERE f.frs_activo = 1
    ORDER BY f.frs_id
  `);
  return result[0] ?? null;
}

// Versión (fv_id) con la que se crea una solicitud (nueva o de ampliación de
// cupo). Exactamente un formulario activo, con su versión activa marcada: sin
// caer a MAX(versión) ni escoger el primero si hay varios activos.
export async function obtenerFvIdFormularioActivo(
  queryable: Queryable,
): Promise<number> {
  const activos = await queryable.query(
    `SELECT frs_id, frs_fv_id_activa FROM Formularios_solicitudes WHERE frs_activo = 1`,
  );
  if (activos.length !== 1) {
    throw new Error(
      `Debe haber exactamente un formulario activo en Formularios_solicitudes (hay ${activos.length}).`,
    );
  }
  if (activos[0].frs_fv_id_activa == null) {
    throw new Error(
      `El formulario activo (frs_id ${activos[0].frs_id}) no tiene versión activa (frs_fv_id_activa).`,
    );
  }
  return Number(activos[0].frs_fv_id_activa);
}
