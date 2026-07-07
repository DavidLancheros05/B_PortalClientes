import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { WorkflowEtapaEntity } from '../../etapas/entities/workflow-etapa.entity';
import { WorkflowResultadoEntity } from '../../resultados/entities/workflow-resultado.entity';
import { SolicitudEntity } from '../../../solicitudes/entities/solicitud.entity';
import { UsuarioEntity } from '../../../usuarios/entities/usuario.entity';

@Entity('solicitud_workflow_historial')
export class SolicitudWorkflowHistorialEntity {
  @PrimaryGeneratedColumn({ name: 'swh_id' })
  swh_id: number;

  @ManyToOne(() => SolicitudEntity)
  @JoinColumn({ name: 'swh_sol_id' })
  swh_sol_id: SolicitudEntity;

  @ManyToOne(() => WorkflowEtapaEntity)
  @JoinColumn({ name: 'swh_etapa_id' })
  swh_etapa_id: WorkflowEtapaEntity;

  @ManyToOne(() => WorkflowResultadoEntity)
  @JoinColumn({ name: 'swh_resultado_id' })
  swh_resultado_id: WorkflowResultadoEntity;

  @ManyToOne(() => UsuarioEntity)
  @JoinColumn({ name: 'swh_usuario_id' })
  swh_usuario_id: UsuarioEntity;

  @Column({
    name: 'swh_comentario',
    type: 'nvarchar',
    length: -1,
    nullable: true,
  })
  swh_comentario: string;

  @CreateDateColumn({ name: 'swh_fecha' })
  swh_fecha: Date;
}
