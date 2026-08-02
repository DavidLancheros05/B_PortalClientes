// src/cliente-archivo/cliente-archivo.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../common/storage/storage.module';
import { ClienteArchivoService } from './cliente-archivo.service';
import { ClienteArchivoController } from './cliente-archivo.controller';

// AuthModule: provee JwtService, requerido por JwtAuthGuard. forwardRef por
// si en el futuro algo dentro de AuthModule termina dependiendo de este
// módulo (mismo ciclo que ya se dio entre AuthModule y NotificacionesModule).
// StorageModule: provee STORAGE_SERVICE, usado por promoverDocumentos para
// duplicar el archivo hacia el "archivo maestro" del cliente.
@Module({
  imports: [forwardRef(() => AuthModule), StorageModule],
  controllers: [ClienteArchivoController],
  providers: [ClienteArchivoService],
  exports: [ClienteArchivoService],
})
export class ClienteArchivoModule {}
