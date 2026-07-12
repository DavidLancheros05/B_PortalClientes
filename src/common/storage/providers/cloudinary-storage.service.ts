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

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: options.folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      filename_override: options.filename,
    });

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
