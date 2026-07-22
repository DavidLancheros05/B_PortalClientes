import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { PedidosController } from './pedidos.controller';
import { PedidosService } from './pedidos.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClienteEntity]), AuthModule],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
