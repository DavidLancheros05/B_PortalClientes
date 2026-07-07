import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('workflow_estado_etapa')
export class WorkflowResultadoEntity {
  @PrimaryGeneratedColumn({ name: 'wee_id' })
  wee_id: number;

  @Column({ name: 'wee_codigo', type: 'varchar', length: 10, unique: true })
  wee_codigo: string;

  @Column({ name: 'wee_nombre', type: 'varchar', length: 50 })
  wee_nombre: string;
}
