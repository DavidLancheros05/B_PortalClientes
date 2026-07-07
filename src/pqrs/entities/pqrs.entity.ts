import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { PQRSTipoEntity } from './pqrs-tipo.entity';
import { PQRSEstadoEntity } from './pqrs-estado.entity';
import { PQRSHistorialEntity } from './pqrs-historial.entity';
import { PQRSComentarioEntity } from './pqrs-comentario.entity';
import { PQRSAdjuntoEntity } from './pqrs-adjunto.entity';
import { PQRSAsignacionEntity } from './pqrs-asignacion.entity';

@Entity('pqrs')
export class PQRSEntity {
  @PrimaryGeneratedColumn()
  pqrs_id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  pqrs_numero: string;

  @Column()
  pqrs_pt_id: number;

  @Column()
  pqrs_pe_id: number;

  @Column({ type: 'int', nullable: true })
  pqrs_cli_id: number;

  @Column({ type: 'int', nullable: true })
  pqrs_cliu_id: number;

  @Column({ type: 'int', nullable: true })
  pqrs_usr_asignado_id: number;

  @Column({ type: 'int', nullable: true })
  pqrs_pri_id: number;

  @Column({ type: 'varchar', length: 255 })
  pqrs_titulo: string;

  @Column({ type: 'text', nullable: true })
  pqrs_descripcion: string;

  @CreateDateColumn()
  pqrs_fecha_creacion: Date;

  @Column({ type: 'datetime2', nullable: true })
  pqrs_fecha_cierre: Date;

  @Column({ type: 'datetime2', nullable: true })
  pqrs_sla_vencimiento: Date;

  @CreateDateColumn()
  pqrs_created_at: Date;

  @UpdateDateColumn()
  pqrs_updated_at: Date;

  @ManyToOne(() => PQRSTipoEntity, (tipo) => tipo.pqrs)
  @JoinColumn({ name: 'pqrs_pt_id' })
  tipo: PQRSTipoEntity;

  @ManyToOne(() => PQRSEstadoEntity, (estado) => estado.pqrs)
  @JoinColumn({ name: 'pqrs_pe_id' })
  estado: PQRSEstadoEntity;

  @OneToMany(() => PQRSHistorialEntity, (historial) => historial.pqrs, {
    cascade: true,
  })
  historial: PQRSHistorialEntity[];

  @OneToMany(() => PQRSComentarioEntity, (comentario) => comentario.pqrs, {
    cascade: true,
  })
  comentarios: PQRSComentarioEntity[];

  @OneToMany(() => PQRSAdjuntoEntity, (adjunto) => adjunto.pqrs, {
    cascade: true,
  })
  adjuntos: PQRSAdjuntoEntity[];

  @OneToMany(() => PQRSAsignacionEntity, (asignacion) => asignacion.pqrs, {
    cascade: true,
  })
  asignaciones: PQRSAsignacionEntity[];
}
