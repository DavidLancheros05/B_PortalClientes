import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormularioSeccionesService } from './formulario-secciones.service';
import { FormularioSeccionesController } from './formulario-secciones.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [TypeOrmModule, AuthModule],
  controllers: [FormularioSeccionesController],
  providers: [FormularioSeccionesService],
})
export class FormularioSeccionesModule {}
