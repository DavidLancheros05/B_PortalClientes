import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { ExistenciasController } from './existencias.controller';
import { ExistenciasService } from './existencias.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClienteEntity]), AuthModule],
  controllers: [ExistenciasController],
  providers: [ExistenciasService],
})
export class ExistenciasModule {}
