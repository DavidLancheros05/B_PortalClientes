export class ClienteDetailResponseDto {
  cli_id: number;
  cli_razon_social: string;
  cli_nro_identificacion: string;
  cli_tipo_identificacion: number;
  cli_direccion: string;
  cli_correo?: string;
  cli_acceso_pc: boolean;
  cli_estado: string;
  cli_es_distribuidor?: boolean;
  cli_nit_dig_vf?: string;
  cli_es_extranjero?: boolean;
  pai_id?: number;
  dpto_id?: number;
  ciu_id?: number;
  ejng_id?: number;
  ejecutivo?: { nombre: string } | null;
  centro_operacion_ids?: number[];
}
