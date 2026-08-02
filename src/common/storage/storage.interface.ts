export const STORAGE_SERVICE = 'STORAGE_SERVICE';

export interface StorageUploadResult {
  url: string;
  providerId: string;
  resourceType: string;
}

/**
 * Contrato genérico de almacenamiento de archivos. Cualquier proveedor
 * (Cloudinary, disco local, S3, etc.) implementa esta interfaz, para que
 * cambiar de proveedor sea solo cambiar el `useClass` en StorageModule, sin
 * tocar los servicios que suben/leen/eliminan documentos.
 */
export interface IStorageService {
  upload(
    buffer: Buffer,
    options: { folder: string; filename: string; mimetype?: string },
  ): Promise<StorageUploadResult>;

  /**
   * Crea una copia física independiente de un archivo ya almacenado, a
   * partir de su URL pública — sin bajar/subir el buffer por este servidor.
   * Usado para "reutilizar" un documento (Cliente_archivo, clonado hacia una
   * Ampliación de Cupo) sin que dos filas de BD terminen apuntando al mismo
   * asset: si una se reemplaza/elimina (`destroy`), la otra debe seguir
   * intacta.
   */
  duplicate(
    sourceUrl: string,
    options: { folder: string; filename: string; resourceType: string },
  ): Promise<StorageUploadResult>;

  destroy(providerId: string, resourceType: string): Promise<void>;

  buildDownloadUrl(
    providerId: string,
    resourceType: string,
    nombreOriginal: string,
    inline?: boolean,
  ): string;
}
