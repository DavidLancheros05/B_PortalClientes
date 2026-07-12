import { Module } from '@nestjs/common';
import { STORAGE_SERVICE } from './storage.interface';
import { CloudinaryStorageService } from './providers/cloudinary-storage.service';

// Para cambiar de proveedor de almacenamiento (disco local, S3, servidor
// propio, etc.) más adelante: crear una nueva clase en ./providers que
// implemente IStorageService, y cambiar el `useClass` de abajo. Ningún
// otro archivo del sistema necesita cambiar.
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      useClass: CloudinaryStorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
