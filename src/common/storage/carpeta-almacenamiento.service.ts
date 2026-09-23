import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Códigos de Urls.url_tipo_archivo reservados para el Portal de Clientes en
// esa tabla compartida con otro sistema (arc_siscom, valores 0/1/2/4) — ver
// documentacion/almacenamiento-de-archivos.md.
export const TIPO_ARCHIVO_URLS = {
  SOLICITUDES: 5,
  PQRS: 6,
} as const;

const CARPETA_BASE_DEFAULT: Record<number, string> = {
  [TIPO_ARCHIVO_URLS.SOLICITUDES]: 'documentos-solicitudes/',
  [TIPO_ARCHIVO_URLS.PQRS]: 'pqrs/',
};

/**
 * Resuelve la carpeta base del almacenamiento para cada tipo de archivo desde
 * Urls.url_nombre en vez de tenerla escrita a mano en cada servicio que
 * sube documentos (ver "Mejora sugerida" en
 * documentacion/almacenamiento-de-archivos.md). Si la fila no existe o la
 * consulta falla, cae al valor por defecto para no bloquear la subida.
 */
@Injectable()
export class CarpetaAlmacenamientoService {
  private readonly logger = new Logger(CarpetaAlmacenamientoService.name);

  constructor(private readonly dataSource: DataSource) {}

  async obtenerBase(tipoArchivo: number): Promise<string> {
    try {
      const [fila] = await this.dataSource.query(
        `SELECT TOP 1 url_nombre FROM Urls WHERE url_tipo_archivo = @0`,
        [tipoArchivo],
      );
      if (fila?.url_nombre) {
        const base = fila.url_nombre as string;
        return base.endsWith('/') ? base : `${base}/`;
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la carpeta base desde Urls (url_tipo_archivo=${tipoArchivo}): ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
    return CARPETA_BASE_DEFAULT[tipoArchivo] ?? '';
  }
}
