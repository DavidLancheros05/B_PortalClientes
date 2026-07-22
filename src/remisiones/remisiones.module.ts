import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { RemisionesController } from './remisiones.controller';
import { RemisionesService } from './remisiones.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClienteEntity]), AuthModule],
  controllers: [RemisionesController],
  providers: [RemisionesService],
})
export class RemisionesModule {}
