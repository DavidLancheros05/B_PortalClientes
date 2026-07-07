import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesService } from './clientes.service';
import { ClientesController } from './clientes.controller';
import { ClienteEntity } from './entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClienteEntity]),
    AuthModule,
    NotificacionesModule,
  ],
  providers: [ClientesService],
  controllers: [ClientesController],
})
export class ClientesModule {}
