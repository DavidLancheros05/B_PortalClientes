import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormularioTiposPreguntaService } from './formulario-tipos-pregunta.service';
import { FormularioTiposPreguntaController } from './formulario-tipos-pregunta.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [TypeOrmModule, AuthModule],
  controllers: [FormularioTiposPreguntaController],
  providers: [FormularioTiposPreguntaService],
})
export class FormularioTiposPreguntaModule {}
