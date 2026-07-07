import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PQRSEntity } from './pqrs.entity';

@Entity('pqrs_adjuntos')
export class PQRSAdjuntoEntity {
  @PrimaryGeneratedColumn()
  pa_id: number;

  @Column()
  pa_pqrs_id: number;

  @Column({ type: 'int', nullable: true })
  pa_usr_id: number;

  @Column({ type: 'int', nullable: true })
  pa_cliu_id: number;

  @Column({ type: 'varchar', length: 255 })
  pa_nombre_original: string;

  @Column({ type: 'varchar', length: 255 })
  pa_nombre_guardado: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pa_ruta: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pa_extension: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pa_mime_type: string;

  @Column({ type: 'bigint', nullable: true })
  pa_tamano: number;

  @CreateDateColumn()
  pa_fecha: Date;

  @CreateDateColumn()
  pa_created_at: Date;

  @ManyToOne(() => PQRSEntity, (pqrs) => pqrs.adjuntos)
  @JoinColumn({ name: 'pa_pqrs_id' })
  pqrs: PQRSEntity;
}
