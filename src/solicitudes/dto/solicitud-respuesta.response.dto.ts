export class SolicitudRespuestaDto {
  fr_id: number;
  fr_solicitud_id: number;
  fr_fp_id: number;
  fr_valor_texto?: string | null;
  fr_valor_numero?: number | null;
  fr_valor_fecha?: Date | null;
  fr_valor_opcion_id?: number | null;
  fr_valor_archivo_id?: number | null;
  fr_es_multiselect?: boolean;
  fr_completado?: boolean;
  fr_observaciones?: string | null;
  fr_created_at?: Date;
  fr_actualizado_por?: number | null;
  fr_updated_at?: Date;
  fr_valor_catalogo_tipo?: string | null;
  fr_valor_catalogo_id?: number | null;
}
