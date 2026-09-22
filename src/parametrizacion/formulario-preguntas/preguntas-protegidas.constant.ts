// "Preguntas protegidas": fp_codigo anclados a lógica hardcodeada en el
// backend (flujo del portal) y/o al envío de datos a SIESA. La fuente de
// verdad es la tabla `formulario_preguntas_reservadas`
// (migrations/20260916_crear_formulario_preguntas_reservadas.sql), no este
// archivo — ver "Documentos Cartonera/documentacion/Funcionalidades/
// preguntas-protegidas-editor.md".
//
// Importante: la tabla hace esto CONSULTABLE (se puede ver sin leer
// TypeScript), no lo hace "editable sin tocar código". El motivo de que un
// fp_codigo esté protegido es que hay código en otro archivo
// (ampliacion-cupo.service.ts, solicitudes-workflow.service.ts,
// cliente-datos-normalizados.service.ts, etc.) que lo busca a mano — agregar
// o Eliminar una fila de la tabla sin tocar ese código (o viceversa) deja la
// protección desincronizada de la realidad.
//
// Cache en memoria con TTL corto: evita pegarle a la BD en cada
// findAll/findOne (se llama seguido desde el editor), pero sigue
// reflejando cambios hechos directo en la tabla sin necesidad de reiniciar
// el proceso.

import type { EntityManager } from 'typeorm';

export type MotivoProteccionPregunta = 'flujo' | 'siesa' | 'flujo_siesa';

const CACHE_TTL_MS = 60_000;

let cache: {
  mapa: Map<string, MotivoProteccionPregunta>;
  cargadoEn: number;
} | null = null;

async function obtenerMapaProtegidas(
  manager: EntityManager,
): Promise<Map<string, MotivoProteccionPregunta>> {
  const ahora = Date.now();
  if (cache && ahora - cache.cargadoEn < CACHE_TTL_MS) {
    return cache.mapa;
  }

  const filas: { fpr_codigo: string; fpr_motivo: MotivoProteccionPregunta }[] =
    await manager.query(
      `SELECT fpr_codigo, fpr_motivo FROM formulario_preguntas_reservadas WHERE fpr_activo = 1`,
    );
  const mapa = new Map(filas.map((f) => [f.fpr_codigo, f.fpr_motivo]));
  cache = { mapa, cargadoEn: ahora };
  return mapa;
}

// Usado por findAll: evita re-consultar la tabla una vez por pregunta.
export async function mapaPreguntasProtegidas(
  manager: EntityManager,
): Promise<Map<string, MotivoProteccionPregunta>> {
  return obtenerMapaProtegidas(manager);
}

export async function motivoProteccionPregunta(
  manager: EntityManager,
  fpCodigo: string | null | undefined,
): Promise<MotivoProteccionPregunta | null> {
  if (!fpCodigo) return null;
  const mapa = await obtenerMapaProtegidas(manager);
  return mapa.get(fpCodigo) ?? null;
}
