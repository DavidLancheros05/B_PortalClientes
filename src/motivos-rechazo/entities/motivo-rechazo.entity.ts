// src/motivos-rechazo/entities/motivo-rechazo.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'Motivos_rechazo_solicitud' })
export class MotivoRechazoEntity {
  @PrimaryGeneratedColumn({ name: 'mrs_id' })
  mrs_id: number;

  @Column({ name: 'mrs_descripcion', type: 'varchar', length: 500 })
  mrs_descripcion: string;

  @Column({ name: 'mrs_activo', type: 'bit', default: true })
  mrs_activo: boolean;

  @Column({ name: 'mrs_usr_crea', type: 'int', nullable: true })
  mrs_usr_crea?: number;

  @Column({ name: 'mrs_usr_modifica', type: 'int', nullable: true })
  mrs_usr_modifica?: number;

  @CreateDateColumn({ name: 'mrs_created_at' })
  mrs_created_at?: Date;

  @Column({ name: 'mrs_updated_at', type: 'datetime2', nullable: true })
  mrs_updated_at?: Date;

  @Column({
    name: 'mrs_descripcion_normalizada',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  mrs_descripcion_normalizada?: string;
}
