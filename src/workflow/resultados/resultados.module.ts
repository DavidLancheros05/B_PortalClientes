import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowResultadoEntity } from './entities/workflow-resultado.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowResultadoEntity])],
  exports: [TypeOrmModule],
})
export class ResultadosModule {}
