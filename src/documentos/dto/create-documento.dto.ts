// src/documentos/dto/create-documento.dto.ts
export class CreateDocumentoDto {
  solicitudId: number;
  tipoDocumentoId: number;
  nombreArchivo: string;
  rutaArchivo: string;
  fechaEmision?: string; // viene como string del frontend
  fechaVencimiento?: string;
  hashArchivo: string;
  usuarioCarga: number;
}
