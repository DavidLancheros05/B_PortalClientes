import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AmpliacionCupoService } from './ampliacion-cupo.service';
import { AmpliacionCupoController } from './ampliacion-cupo.controller';

// Sin TypeOrmModule.forFeature: no hay tabla propia — el service trabaja
// directo sobre `solicitudes` (sol_cupo_solicitado, sol_justificacion_ampliacion)
// vía el DataSource global, igual que el resto de src/solicitudes/*.
// AuthModule: provee JwtService, requerido por JwtAuthGuard.
@Module({
  imports: [AuthModule],
  controllers: [AmpliacionCupoController],
  providers: [AmpliacionCupoService],
  exports: [AmpliacionCupoService],
})
export class AmpliacionCupoModule {}
