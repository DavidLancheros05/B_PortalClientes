import { Module } from '@nestjs/common';
import { CorreosPorRolService } from './correos-por-rol.service';
import { CorreosPorRolController } from './correos-por-rol.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CorreosPorRolController],
  providers: [CorreosPorRolService],
  exports: [CorreosPorRolService],
})
export class CorreosPorRolModule {}
