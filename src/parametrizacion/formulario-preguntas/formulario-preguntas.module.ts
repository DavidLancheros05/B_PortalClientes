import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormularioPreguntasController } from './formulario-preguntas.controller';
import { FormularioPreguntasService } from './formulario-preguntas.service';
import { FormularioPregunta } from './entities/formulario-pregunta.entity';
import { Seccion } from '../formulario-secciones/entities/seccion.entity';
import { OpcionesModule } from '../opciones/opciones.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FormularioPregunta, Seccion]),
    OpcionesModule,
    AuthModule,
  ],
  controllers: [FormularioPreguntasController],
  providers: [FormularioPreguntasService],
})
export class FormularioPreguntasModule {}
