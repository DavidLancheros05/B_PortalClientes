import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { MailModule } from '../mail/mail.module';
import { SolicitudEntity } from '../solicitudes/entities/solicitud.entity';
import { ClienteEntity } from '../clientes/entities/clientes.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudEntity, ClienteEntity]),
    MailModule,
  ],
  providers: [NotificacionesService],
  controllers: [NotificacionesController],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
