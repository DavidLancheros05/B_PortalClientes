import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PQRSEntity } from './pqrs.entity';
import { PQRSEstadoEntity } from './pqrs-estado.entity';

@Entity('pqrs_historial')
export class PQRSHistorialEntity {
  @PrimaryGeneratedColumn()
  ph_id: number;

  @Column()
  ph_pqrs_id: number;

  @Column({ type: 'int', nullable: true })
  ph_pe_anterior_id: number;

  @Column({ type: 'int', nullable: true })
  ph_pe_nuevo_id: number;

  @Column({ type: 'int', nullable: true })
  ph_usr_id: number;

  @Column({ type: 'int', nullable: true })
  ph_cliu_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ph_accion: string;

  @Column({ type: 'text', nullable: true })
  ph_comentario: string;

  @CreateDateColumn()
  ph_fecha: Date;

  @CreateDateColumn()
  ph_created_at: Date;

  @ManyToOne(() => PQRSEntity, (pqrs) => pqrs.historial)
  @JoinColumn({ name: 'ph_pqrs_id' })
  pqrs: PQRSEntity;

  @ManyToOne(() => PQRSEstadoEntity, (estado) => estado.historialesAnterior, {
    nullable: true,
  })
  @JoinColumn({ name: 'ph_pe_anterior_id' })
  estadoAnterior: PQRSEstadoEntity;

  @ManyToOne(() => PQRSEstadoEntity, (estado) => estado.historialesNuevo, {
    nullable: true,
  })
  @JoinColumn({ name: 'ph_pe_nuevo_id' })
  estadoNuevo: PQRSEstadoEntity;
}
