import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MotivoRechazoEntity } from './entities/motivo-rechazo.entity';
import { MotivosRechazoService } from './motivos-rechazo.service';
import { MotivosRechazoController } from './motivos-rechazo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MotivoRechazoEntity])],
  controllers: [MotivosRechazoController],
  providers: [MotivosRechazoService],
  exports: [MotivosRechazoService],
})
export class MotivosRechazoModule {}
