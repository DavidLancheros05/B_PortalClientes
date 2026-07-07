import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudWorkflowHistorialEntity } from './entities/solicitud-workflow-historial.entity';
import { HistorialWorkflowService } from './historial-workflow.service';

@Module({
  imports: [TypeOrmModule.forFeature([SolicitudWorkflowHistorialEntity])],
  providers: [HistorialWorkflowService],
  exports: [HistorialWorkflowService],
})
export class HistorialModule {}
