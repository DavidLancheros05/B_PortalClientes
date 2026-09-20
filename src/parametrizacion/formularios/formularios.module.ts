import { Module } from '@nestjs/common';
import { FormulariosService } from './formularios.service';
import { FormulariosController } from './formularios.controller';
import { AuthModule } from '../../auth/auth.module';
import { ClienteDatosNormalizadosModule } from '../../cliente-datos-normalizados/cliente-datos-normalizados.module';

@Module({
  imports: [AuthModule, ClienteDatosNormalizadosModule],
  controllers: [FormulariosController],
  providers: [FormulariosService],
})
export class FormulariosModule {}
