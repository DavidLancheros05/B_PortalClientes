import { Module } from '@nestjs/common';
import { EtapasModule } from './etapas/etapas.module';
import { ResultadosModule } from './resultados/resultados.module';
import { HistorialModule } from './historial/historial.module';

@Module({
  imports: [EtapasModule, ResultadosModule, HistorialModule],
  exports: [EtapasModule, ResultadosModule, HistorialModule],
})
export class WorkflowModule {}
