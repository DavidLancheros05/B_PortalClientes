export class ClienteListResponseDto {
  cli_id: number;
  cli_razon_social: string;
  cli_nro_identificacion?: string;
  cli_direccion?: string;
  cli_correo?: string;
  cli_estado: string;
  cli_acceso_pc: boolean;
  cli_siesa?: boolean;
  ejng_id?: number;
  ejecutivo?: { nombre: string } | null;
}
