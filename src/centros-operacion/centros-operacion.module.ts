import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentroOperacionEntity } from './entities/centro-operacion.entity';
import { CentrosOperacionService } from './centros-operacion.service';
import { CentrosOperacionController } from './centros-operacion.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CentroOperacionEntity])],
  providers: [CentrosOperacionService],
  controllers: [CentrosOperacionController],
  exports: [CentrosOperacionService],
})
export class CentrosOperacionModule {}
