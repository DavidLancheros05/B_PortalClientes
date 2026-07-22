import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../common/storage/storage.module';
import { PQRSController } from './pqrs.controller';
import { PQRSService } from './pqrs.service';
import {
  PQRSEntity,
  PQRSTipoEntity,
  PQRSEstadoEntity,
  PQRSHistorialEntity,
  PQRSComentarioEntity,
  PQRSAdjuntoEntity,
  PQRSAsignacionEntity,
} from './entities';
import { UsuarioEntity } from '../usuarios/entities/usuario.entity';
import { ClienteEntity } from '../clientes/entities/clientes.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PQRSEntity,
      PQRSTipoEntity,
      PQRSEstadoEntity,
      PQRSHistorialEntity,
      PQRSComentarioEntity,
      PQRSAdjuntoEntity,
      PQRSAsignacionEntity,
      UsuarioEntity,
      ClienteEntity,
    ]),
    AuthModule,
    StorageModule,
  ],
  controllers: [PQRSController],
  providers: [PQRSService],
  exports: [PQRSService],
})
export class PqrsModule {}
