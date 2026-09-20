import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesService } from './clientes.service';
import { ClientesSiesaService } from './clientes-siesa.service';
import { ClientesController } from './clientes.controller';
import { ClienteEntity } from './entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { SolicitudesModule } from '../solicitudes/solicitudes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClienteEntity]),
    AuthModule,
    NotificacionesModule,
    SolicitudesModule,
  ],
  providers: [ClientesService, ClientesSiesaService],
  controllers: [ClientesController],
})
export class ClientesModule {}
