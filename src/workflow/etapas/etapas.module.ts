import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowEtapaEntity } from './entities/workflow-etapa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowEtapaEntity])],
  exports: [TypeOrmModule],
})
export class EtapasModule {}
