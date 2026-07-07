import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndicadoresService } from './indicadores.service';
import { IndicadoresController } from './indicadores.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([]), AuthModule],
  controllers: [IndicadoresController],
  providers: [IndicadoresService],
  exports: [IndicadoresService],
})
export class IndicadoresModule {}
