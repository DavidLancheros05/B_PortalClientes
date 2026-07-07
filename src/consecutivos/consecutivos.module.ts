import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ConsecutivoEntity, TipoConsecutivoEntity } from './entities';
import { ConsecutivosService } from './consecutivos.service';
import { ConsecutivosController } from './consecutivos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConsecutivoEntity, TipoConsecutivoEntity]),
    AuthModule,
  ],
  providers: [ConsecutivosService],
  controllers: [ConsecutivosController],
  exports: [ConsecutivosService],
})
export class ConsecutivosModule {}
