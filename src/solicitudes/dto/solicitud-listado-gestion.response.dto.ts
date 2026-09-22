export class SolicitudListadoGestionDto {
  // Identificación
  sol_id: number;
  sol_numero: string;

  // Cliente
  sol_cli_id: number;
  cliente_nombre: string;

  // Ejecutivo
  sol_ejng_id: number;
  ejecutivo_nombre: string;
  ejecutivo_area?: string;

  // Auxiliar (puede ser null en muchos casos)
  auxiliar_id?: number | null;
  auxiliar_nombre?: string | null;
  auxiliar_area?: string | null;

  // Estado del Flujo
  sol_ses_id: number;
  sol_wet_id: number;
  etapa_nombre: string;
  sol_wee_id: number;
  resultado_nombre: string;

  // Fecha base
  sol_fecha_creacion: Date;
  sol_fecha_envio?: Date | null;
  sol_fecha_aprobacion?: Date | null;

  // Aprobación financiera
  sol_cupo_aprobado?: number;
  sol_cupo_solicitado?: number | null;
  sol_plazo_pago?: number;
  sol_forma_pago?: string;

  // Versión
  sol_formulario_version?: number;

  // Timeline: Oficial Cumplimiento
  sol_fecha_est_gest_oc?: Date;
  sol_fecha_gest_oc?: Date;

  // Timeline: Ejecutivo
  sol_fecha_est_gest_ejn?: Date;
  sol_fecha_gest_ejn?: Date;

  // Timeline: Auxiliar Servicio Cliente
  sol_fecha_est_gest_asc?: Date;
  sol_fecha_gest_asc?: Date;

  // Timeline: Comité Crédito 1
  sol_fecha_est_gest_cc1?: Date;
  sol_fecha_gest_cc1?: Date;

  // Timeline: Comité Crédito 2
  sol_fecha_est_gest_cc2?: Date;
  sol_fecha_gest_cc2?: Date;
}
