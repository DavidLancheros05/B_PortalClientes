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
  ejng_id?: number;
  ejecutivo?: { nombre: string } | null;
}
