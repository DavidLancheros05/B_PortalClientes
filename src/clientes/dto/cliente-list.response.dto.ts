export class ClienteListResponseDto {
  cli_id: number;
  cli_razon_social: string;
  cli_nro_identificacion?: string;
  cli_direccion?: string;
  cli_correo?: string;
  cli_estado: string;
  ejng_id?: number;
  ejecutivo?: { nombre: string } | null;
}
