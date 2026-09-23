import { Module } from '@nestjs/common';
import { SeguridadService } from './seguridad.service';
import { SeguridadController } from './seguridad.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SeguridadController],
  providers: [SeguridadService],
  exports: [SeguridadService],
})
export class SeguridadModule {}
