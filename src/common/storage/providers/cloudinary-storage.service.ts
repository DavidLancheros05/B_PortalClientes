import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import {
  IStorageService,
  StorageUploadResult,
} from '../storage.interface';

@Injectable()
export class CloudinaryStorageService implements IStorageService {
  private readonly logger = new Logger(CloudinaryStorageService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  // Cloudinary rechaza con un objeto plano ({ error: { message, http_code,
  // name } }), no con un Error: sin esto el mensaje llegaba al usuario como
  // "[object Object]".
  private aError(error: unknown): Error {
    if (error instanceof Error) return error;
    const e = (error as any)?.error ?? error;
    const mensaje = e?.message || JSON.stringify(e);
    const err = new Error(`Cloudinary: ${mensaje}`);
    (err as any).httpCode = e?.http_code;
    (err as any).nombre = e?.name;
    return err;
  }

  // Timeouts y cortes de red hacia Cloudinary son intermitentes (visto
  // 2026-09-23: resolución DNS de ~11 s → TimeoutError 499; el mismo
  // archivo subió bien al reintentar). Se reintenta solo ese tipo de error,
  // nunca uno de validación (4xx) — ahí reintentar no cambia nada.
  private esErrorTransitorio(error: Error): boolean {
    const httpCode = Number((error as any).httpCode);
    const codigo = String((error as any).code ?? '');
    return (
      (error as any).nombre === 'TimeoutError' ||
      httpCode === 499 ||
      httpCode >= 500 ||
      ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND'].includes(codigo) ||
      /timeout|socket hang up/i.test(error.message)
    );
  }

  private async conReintentos<T>(operacion: () => Promise<T>, descripcion: string) {
    const intentos = 3;
    for (let intento = 1; ; intento++) {
      try {
        return await operacion();
      } catch (bruto) {
        const error = this.aError(bruto);
        if (intento >= intentos || !this.esErrorTransitorio(error)) throw error;
        this.logger.warn(
          `${descripcion}: intento ${intento}/${intentos} falló (${error.message}), reintentando…`,
        );
        await new Promise((r) => setTimeout(r, 1000 * intento));
      }
    }
  }

  async upload(
    buffer: Buffer,
    options: { folder: string; filename: string; mimetype?: string },
  ): Promise<StorageUploadResult> {
    const mimetype = options.mimetype || 'application/octet-stream';
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;

    // Cloudinary clasifica los PDF como resource_type "image" bajo 'auto'
    // (para poder generar previsualizaciones), pero las cuentas nuevas
    // bloquean por defecto la entrega de PDF/ZIP servidos como "image"
    // (HTTP 401 al abrir el archivo). Forzamos "raw" para todo lo que no
    // sea una imagen real, evitando esa restricción.
    const resourceType = mimetype.startsWith('image/') ? 'image' : 'raw';

    const result = await this.conReintentos(
      () =>
        cloudinary.uploader.upload(dataUri, {
          folder: options.folder,
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true,
          filename_override: options.filename,
        }),
      `Subida de ${options.filename}`,
    );

    return {
      url: result.secure_url,
      providerId: result.public_id,
      resourceType: result.resource_type,
    };
  }

  async duplicate(
    sourceUrl: string,
    options: { folder: string; filename: string; resourceType: string },
  ): Promise<StorageUploadResult> {
    // Cloudinary puede tomar una URL pública (incluida una propia de
    // res.cloudinary.com) como origen y la trae del lado del servidor — no
    // hace falta bajar el archivo por este backend y volver a subirlo.
    // Resultado: un asset nuevo con su propio public_id, independiente del
    // original (borrar uno no afecta al otro).
    const result = await this.conReintentos(
      () =>
        cloudinary.uploader.upload(sourceUrl, {
          folder: options.folder,
          resource_type: (options.resourceType || 'raw') as
            | 'raw'
            | 'image'
            | 'video'
            | 'auto',
          use_filename: true,
          unique_filename: true,
          filename_override: options.filename,
        }),
      `Copia de ${options.filename}`,
    );

    return {
      url: result.secure_url,
      providerId: result.public_id,
      resourceType: result.resource_type,
    };
  }

  async destroy(providerId: string, resourceType: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(providerId, {
        resource_type: resourceType || 'raw',
      });
      this.logger.log(`Archivo eliminado de Cloudinary: ${providerId}`);
    } catch (error) {
      this.logger.warn(
        `No se pudo eliminar de Cloudinary (${providerId}): ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  buildDownloadUrl(
    providerId: string,
    resourceType: string,
    nombreOriginal: string,
    inline = false,
  ): string {
    const nombreSinExtension = nombreOriginal.replace(/\.[^./\\]+$/, '');
    const nombreSanitizado =
      nombreSinExtension.replace(/[^a-zA-Z0-9-_ ]/g, '_') || 'documento';

    return cloudinary.url(providerId, {
      resource_type: resourceType || 'raw',
      secure: true,
      // inline=true: se abre en el navegador (sin Content-Disposition
      // attachment). inline=false (default): fuerza la descarga.
      flags: inline ? undefined : `attachment:${nombreSanitizado}`,
    });
  }
}
