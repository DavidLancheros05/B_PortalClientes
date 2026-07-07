import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PQRSEntity } from './pqrs.entity';
import { PQRSHistorialEntity } from './pqrs-historial.entity';

@Entity('pqrs_estados')
export class PQRSEstadoEntity {
  @PrimaryGeneratedColumn()
  pe_id: number;

  @Column({ type: 'varchar', length: 100 })
  pe_nombre: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  pe_codigo: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  pe_color: string;

  @Column({ type: 'int', nullable: true })
  pe_orden: number;

  @Column({ type: 'bit', default: true })
  pe_estado: boolean;

  @CreateDateColumn()
  pe_created_at: Date;

  @UpdateDateColumn()
  pe_updated_at: Date;

  @OneToMany(() => PQRSEntity, (pqrs) => pqrs.estado)
  pqrs: PQRSEntity[];

  @OneToMany(() => PQRSHistorialEntity, (historial) => historial.estadoAnterior)
  historialesAnterior: PQRSHistorialEntity[];

  @OneToMany(() => PQRSHistorialEntity, (historial) => historial.estadoNuevo)
  historialesNuevo: PQRSHistorialEntity[];
}
