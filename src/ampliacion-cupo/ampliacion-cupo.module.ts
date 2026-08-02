import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClienteArchivoModule } from '../cliente-archivo/cliente-archivo.module';
import { StorageModule } from '../common/storage/storage.module';
import { AmpliacionCupoService } from './ampliacion-cupo.service';
import { AmpliacionCupoController } from './ampliacion-cupo.controller';

// Sin TypeOrmModule.forFeature: no hay tabla propia — el service trabaja
// directo sobre `solicitudes` (sol_cupo_solicitado, sol_justificacion_ampliacion)
// vía el DataSource global, igual que el resto de src/solicitudes/*.
// AuthModule: provee JwtService, requerido por JwtAuthGuard. ClienteArchivoModule:
// provee ClienteArchivoService, usado por verificarDocumentosVencidos.
// StorageModule: provee STORAGE_SERVICE, usado por clonarDocumentosClienteArchivo
// para duplicar los documentos del cliente hacia la solicitud nueva.
@Module({
  imports: [AuthModule, ClienteArchivoModule, StorageModule],
  controllers: [AmpliacionCupoController],
  providers: [AmpliacionCupoService],
  exports: [AmpliacionCupoService],
})
export class AmpliacionCupoModule {}
