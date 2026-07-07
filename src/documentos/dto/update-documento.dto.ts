// src/documentos/dto/update-documento.dto.ts
export class UpdateDocumentoDto {
  solicitudId?: number;
  tipoDocumentoId?: number;
  nombreArchivo?: string;
  rutaArchivo?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  hashArchivo?: string;
  usuarioCarga?: number;
}
