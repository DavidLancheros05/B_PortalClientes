export class SolicitudClienteDto {
  // Identificación
  sol_id: number;
  sol_numero_solicitud: string;

  // Estado del flujo
  sol_estado_id: number;
  sol_etapa_actual_id: number;
  sol_resultado_etapa_id: number;

  // Cliente y Centro
  sol_cliente_id: number;
  cliente_nombre: string;
  cliente_nit: string;
  sol_co_id: number;
  centro_operacion_nombre: string;

  // Timeline
  sol_fecha_creacion: Date;
  sol_created_at?: Date;
  sol_updated_at?: Date;

  // Datos del negocio
  sol_consumo_mensual_proyectado?: number;
  sol_es_zona_franca?: boolean;

  // Aprobación financiera
  sol_cupo_aprobado?: number;
  sol_plazo_pago?: number;
  sol_forma_pago?: string;

  // Metadata
  sol_formulario_version?: number;
  sol_version?: number;
  sol_usuario_aprueba_condiciones?: number;
}
