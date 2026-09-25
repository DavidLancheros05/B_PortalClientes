export class ClienteListResponseDto {
  cli_id: number;
  cli_razon_social: string;
  cli_nro_identificacion?: string;
  cli_direccion?: string;
  cli_correo?: string;
  cli_estado: string;
  cli_acceso_pc: boolean;
  cli_es_distribuidor?: boolean;
  cli_nit_dig_vf?: string;
  cli_es_extranjero?: boolean;
  cli_siesa?: boolean;
  cli_intentos_login: number;
  // Bloqueo temporal por intentos fallidos (solo informativo).
  cli_bloqueado: boolean;
  cli_bloqueo_min_restantes?: number | null;
  ejng_id?: number;
  ejecutivo?: { nombre: string } | null;
}
