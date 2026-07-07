import { Module } from '@nestjs/common';
import { FormularioController } from './formulario.controller';
import { FormularioService } from './formulario.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [FormularioController],
  providers: [FormularioService],
})
export class FormularioModule {}
