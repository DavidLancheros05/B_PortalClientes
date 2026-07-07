// src/parametrizacion/opciones/opciones.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormularioPreguntaOpcion } from './entities/formulario-pregunta-opcion.entity';
import { OpcionesService } from './opciones.service';

@Module({
  imports: [TypeOrmModule.forFeature([FormularioPreguntaOpcion])],
  providers: [OpcionesService],
  exports: [OpcionesService], // << importante para usarlo en otros módulos
})
export class OpcionesModule {}
