import { Module } from '@nestjs/common';
import { TiposIdentificacionService } from './tipos-identificacion.service';
import { TiposIdentificacionController } from './tipos-identificacion.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [TiposIdentificacionController],
  providers: [TiposIdentificacionService],
  exports: [TiposIdentificacionService],
})
export class TiposIdentificacionModule {}
