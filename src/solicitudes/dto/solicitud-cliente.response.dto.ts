export class SolicitudClienteDto {
  // Identificación
  sol_id: number;
  sol_numero: string;

  // Estado del flujo
  sol_ses_id: number;
  estado_codigo?: string;
  sol_wet_id: number;
  etapa_codigo?: string;
  sol_wee_id: number;
  resultado_codigo?: string;

  // Cliente
  sol_cli_id: number;
  cliente_nombre: string;
  cliente_nit: string;

  // Timeline
  sol_fecha_creacion: Date;
  sol_created_at?: Date;
  sol_updated_at?: Date;

  // Datos del negocio
  sol_consumo_mensual_proyectado?: number;

  // Aprobación financiera
  sol_cupo_aprobado?: number;
  sol_cupo_solicitado?: number | null;
  sol_plazo_pago?: number;
  sol_forma_pago?: string;

  // Metadata
  sol_formulario_version?: number;
  sol_version?: number;
  sol_usr_id_apr_cond?: number;
  sol_observacion_cliente?: string;
}
