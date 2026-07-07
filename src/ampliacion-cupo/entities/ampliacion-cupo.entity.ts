import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ampliacion_cupo')
export class AmpliacionCupoEntity {
  @PrimaryGeneratedColumn()
  ac_id: number;

  @Column({ type: 'int' })
  ac_cliente_id: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  ac_nuevo_cupo: number;

  @Column({ type: 'nvarchar', length: -1 })
  ac_justificacion: string;

  @Column({ type: 'int', nullable: true })
  ac_solicitud_anterior_id: number | null;

  @Column({ type: 'int', nullable: true })
  ac_solicitud_id: number | null;

  @Column({ type: 'int', nullable: true })
  ac_estado_id: number | null;

  @Column({ type: 'int', nullable: true })
  ac_etapa_actual_id: number | null;

  @Column({ type: 'int', nullable: true })
  ac_resultado_etapa_id: number | null;

  @CreateDateColumn({ type: 'datetime' })
  ac_fecha_creacion: Date;
}
