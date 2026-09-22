export class SolicitudPendienteDto {
  // Identificación - lo mínimo para saber qué solicitud es
  sol_id: number;
  sol_numero: string;

  // Contexto - de quién
  sol_cli_id: number;
  cliente_nombre: string;

  // Estado - para badges/colores/iconos
  sol_ses_id: number;
  estado_descripcion?: string;

  // Timeline - para saber antigüedad
  sol_fecha_creacion: Date;

  // Workflow actual (opcional, para filtros avanzados)
  sol_wet_id?: number;
  sol_wee_id?: number;
}
