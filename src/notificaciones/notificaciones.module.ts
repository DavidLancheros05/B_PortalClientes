import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { SolicitudEntity } from '../solicitudes/entities/solicitud.entity';
import { ClienteEntity } from '../clientes/entities/clientes.entity';

// AuthModule: provee JwtService, requerido por JwtAuthGuard (mismo fix que
// ampliacion-cupo.module.ts). forwardRef porque AuthModule ya importa
// NotificacionesModule (AuthService lo usa para el correo de reset de
// contraseña) — sin esto, el ciclo AuthModule <-> NotificacionesModule
// impide que Nest resuelva JwtService.
@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudEntity, ClienteEntity]),
    MailModule,
    forwardRef(() => AuthModule),
  ],
  providers: [NotificacionesService],
  controllers: [NotificacionesController],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}
