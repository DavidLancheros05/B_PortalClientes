export class SolicitudRespuestaDto {
  fr_id: number;
  fr_sol_id: number;
  fr_fp_id: number;
  fr_valor_texto?: string | null;
  fr_valor_numero?: number | null;
  fr_valor_fecha?: Date | null;
  fr_valor_opcion_id?: number | null;
  fr_observaciones?: string | null;
  fr_created_at?: Date;
  fr_usr_id_actualizo?: number | null;
  fr_updated_at?: Date;
  fr_valor_catalogo_tipo?: string | null;
  fr_valor_catalogo_id?: number | null;
}
