import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PQRSEntity } from './pqrs.entity';

@Entity('pqrs_asignaciones')
export class PQRSAsignacionEntity {
  @PrimaryGeneratedColumn()
  pas_id: number;

  @Column()
  pas_pqrs_id: number;

  @Column()
  pas_usr_id: number;

  @CreateDateColumn()
  pas_fecha_asignacion: Date;

  @Column({ type: 'bit', default: true })
  pas_activo: boolean;

  @ManyToOne(() => PQRSEntity, (pqrs) => pqrs.asignaciones)
  @JoinColumn({ name: 'pas_pqrs_id' })
  pqrs: PQRSEntity;
}
