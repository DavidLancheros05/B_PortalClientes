import { Module } from '@nestjs/common';
import { SolicitudEstadosService } from './solicitud-estados.service';
import { SolicitudEstadosController } from './solicitud-estados.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SolicitudEstadosController],
  providers: [SolicitudEstadosService],
  exports: [SolicitudEstadosService],
})
export class SolicitudEstadosModule {}
