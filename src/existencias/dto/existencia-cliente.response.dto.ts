export class ExistenciaClienteResponseDto {
  item: string;
  referencia: string;
  descripcionItem: string;
  cliente: string;
  lote: string | null;
  cantidadExistencia: number;
  cantidadDisponible: number;
  peso: number;
  volumen: number;
  fechaLote: string | null;
  fechaUltimaEntrada: string | null;
  ubicacion: string | null;
  bodega: string;
  ejecutivoNegocio: string | null;
}
