import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PQRSEntity } from './pqrs.entity';

@Entity('pqrs_tipos')
export class PQRSTipoEntity {
  @PrimaryGeneratedColumn()
  pt_id: number;

  @Column({ type: 'varchar', length: 100 })
  pt_nombre: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  pt_codigo: string;

  @Column({ type: 'bit', default: true })
  pt_estado: boolean;

  @CreateDateColumn()
  pt_created_at: Date;

  @UpdateDateColumn()
  pt_updated_at: Date;

  @OneToMany(() => PQRSEntity, (pqrs) => pqrs.tipo)
  pqrs: PQRSEntity[];
}
