import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('workflow_etapas')
export class WorkflowEtapaEntity {
  @PrimaryGeneratedColumn({ name: 'wet_id' })
  wet_id: number;

  @Column({ name: 'wet_codigo', type: 'varchar', length: 10, unique: true })
  wet_codigo: string;

  @Column({ name: 'wet_nombre', type: 'varchar', length: 100 })
  wet_nombre: string;

  @Column({ name: 'wet_orden', type: 'int' })
  wet_orden: number;

  @Column({ name: 'wet_activo', type: 'bit', default: true })
  wet_activo: boolean;

  @CreateDateColumn({ name: 'wet_created_at' })
  wet_created_at: Date;

  @UpdateDateColumn({ name: 'wet_updated_at' })
  wet_updated_at: Date;
}
