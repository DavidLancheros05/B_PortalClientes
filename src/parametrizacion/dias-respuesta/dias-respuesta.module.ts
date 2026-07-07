import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaRespuesta } from './dias-respuesta.entity';
import { DiasRespuestaService } from './dias-respuesta.service';
import { DiasRespuestaController } from './dias-respuesta.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DiaRespuesta])],
  controllers: [DiasRespuestaController],
  providers: [DiasRespuestaService],
})
export class DiasRespuestaModule {}
