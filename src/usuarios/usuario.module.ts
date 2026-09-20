// src/users/users.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuarioService } from './usuario.service';
import { UsuarioController } from './usuario.controller';
import { UsuarioEntity } from './entities/usuario.entity';
import { UsuariosCentrosEntity } from './entities/usuarios-centros.entity';
import { RolEntity } from '../roles/entities/rol.entity';
import { CentroOperacionEntity } from '../centros-operacion/entities/centro-operacion.entity';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    forwardRef(() => AuthModule),
    MailModule,
    NotificacionesModule,
    TypeOrmModule.forFeature([
      UsuarioEntity,
      UsuariosCentrosEntity,
      CentroOperacionEntity,
      RolEntity,
    ]),
  ],
  providers: [UsuarioService],
  controllers: [UsuarioController],
  exports: [UsuarioService],
})
export class UsuarioModule {}
