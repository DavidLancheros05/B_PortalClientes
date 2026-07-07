export class SolicitudPendienteDto {
  // Identificación - lo mínimo para saber qué solicitud es
  sol_id: number;
  sol_numero_solicitud: string;

  // Contexto - de quién, dónde
  sol_cliente_id: number;
  cliente_nombre: string;
  sol_co_id: number;
  centro_operacion_nombre: string;

  // Estado - para badges/colores/iconos
  sol_estado_id: number;
  estado_descripcion?: string;

  // Timeline - para saber antigüedad
  sol_fecha_creacion: Date;

  // Workflow actual (opcional, para filtros avanzados)
  sol_etapa_actual_id?: number;
  sol_resultado_etapa_id?: number;
}
