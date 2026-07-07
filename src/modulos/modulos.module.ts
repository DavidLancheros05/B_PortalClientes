import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModulosService } from './modulos.service';
import { ModulosController } from './modulos.controller';
import { ModuloEntity } from './entities/modulo.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([ModuloEntity]), AuthModule],
  providers: [ModulosService],
  controllers: [ModulosController],
  exports: [ModulosService],
})
export class ModulosModule {}
