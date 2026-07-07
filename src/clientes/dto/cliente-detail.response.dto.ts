export class ClienteDetailResponseDto {
  cli_id: number;
  cli_razon_social: string;
  cli_nro_identificacion: string;
  cli_tipo_identificacion: number;
  cli_direccion: string;
  cli_correo?: string;
  cli_acceso_portal_clientes: boolean;
  cli_estado: string;
  ejng_id?: number;
  ejecutivo?: { nombre: string } | null;
  centro_operacion_ids?: number[];
}
