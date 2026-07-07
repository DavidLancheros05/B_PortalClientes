export class PQRSResponseDto {
  pqrs_id: number;
  pqrs_numero: string;
  pqrs_titulo: string;
  pqrs_descripcion: string;
  pqrs_fecha_creacion: Date;
  pqrs_estado_id: number;
  pqrs_pt_id: number;
  pqrs_sla_vencimiento: Date;
  tipo?: any;
  estado?: any;
}

export class ListadoPQRSResponseDto {
  pqrs_id: number;
  pqrs_numero: string;
  pqrs_titulo: string;
  pqrs_fecha_creacion: Date;
  pqrs_estado_id: number;
  tipo_nombre: string;
  estado_nombre: string;
  usuario_asignado: string;
}
