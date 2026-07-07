import { Module } from '@nestjs/common';
import { SeguridadService } from './seguridad.service';
import { SeguridadController } from './seguridad.controller';
import { AuthModule } from '../auth/auth.module';
import { RolesModule } from '../modules/seguridad/roles/roles.module';

@Module({
  imports: [AuthModule, RolesModule],
  controllers: [SeguridadController],
  providers: [SeguridadService],
  exports: [SeguridadService, RolesModule],
})
export class SeguridadModule {}
