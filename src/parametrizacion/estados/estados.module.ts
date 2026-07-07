import { Module } from '@nestjs/common';
import { EstadosService } from './estados.service';
import { EstadosController } from './estados.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [EstadosController],
  providers: [EstadosService],
  exports: [EstadosService],
})
export class EstadosModule {}
