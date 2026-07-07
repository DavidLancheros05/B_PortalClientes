export class SolicitudListadoGestionDto {
  // Identificación
  sol_id: number;
  sol_numero_solicitud: string;

  // Cliente
  sol_cliente_id: number;
  cliente_nombre: string;

  // Centro Operación
  sol_co_id: number;
  centro_operacion_nombre: string;

  // Ejecutivo
  sol_ejecutivo_id: number;
  ejecutivo_nombre: string;
  ejecutivo_area?: string;

  // Auxiliar (puede ser null en muchos casos)
  auxiliar_id?: number | null;
  auxiliar_nombre?: string | null;
  auxiliar_area?: string | null;

  // Estado del Flujo
  sol_estado_id: number;
  sol_etapa_actual_id: number;
  etapa_nombre: string;
  sol_resultado_etapa_id: number;
  resultado_nombre: string;

  // Fecha base
  sol_fecha_creacion: Date;

  // Aprobación financiera
  sol_cupo_aprobado?: number;
  sol_plazo_pago?: number;
  sol_forma_pago?: string;

  // Versión
  sol_formulario_version?: number;

  // Timeline: Respuesta Comercial
  sol_fecha_estimada_respuesta_comercial?: Date;
  sol_fecha_real_respuesta_comercial?: Date;

  // Timeline: Respuesta Financiera
  sol_fecha_estimada_respuesta_financiera?: Date;
  sol_fecha_real_respuesta_financiera?: Date;

  // Timeline: Oficial Cumplimiento
  sol_fecha_estimada_oficial_cumplimiento?: Date;
  sol_fecha_real_oficial_cumplimiento?: Date;

  // Timeline: Ejecutivo
  sol_fecha_estimada_ejecutivo?: Date;
  sol_fecha_real_ejecutivo?: Date;

  // Timeline: Auxiliar Servicio Cliente
  sol_fecha_estimada_auxiliar_servicio_cliente?: Date;
  sol_fecha_real_auxiliar_servicio_cliente?: Date;

  // Timeline: Comité Crédito 1
  sol_fecha_estimada_comite_credito_1?: Date;
  sol_fecha_real_comite_credito_1?: Date;
  sol_fecha_estimada_comite_credito_1_ejecutivo?: Date;
  sol_fecha_real_comite_credito_1_ejecutivo?: Date;
  sol_fecha_estimada_comite_credito_1_auxiliar?: Date;
  sol_fecha_real_comite_credito_1_auxiliar?: Date;

  // Timeline: Comité Crédito 2
  sol_fecha_estimada_comite_credito_2?: Date;
  sol_fecha_real_comite_credito_2?: Date;
  sol_fecha_estimada_comite_credito_2_ejecutivo?: Date;
  sol_fecha_real_comite_credito_2_ejecutivo?: Date;
  sol_fecha_estimada_comite_credito_2_auxiliar?: Date;
  sol_fecha_real_comite_credito_2_auxiliar?: Date;
}
