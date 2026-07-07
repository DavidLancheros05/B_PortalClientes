import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PQRSEntity } from './pqrs.entity';
import { UsuarioEntity } from '../../usuarios/entities/usuario.entity';
import { ClienteEntity } from '../../clientes/entities/clientes.entity';

@Entity('pqrs_comentarios')
export class PQRSComentarioEntity {
  @PrimaryGeneratedColumn()
  pc_id: number;

  @Column()
  pc_pqrs_id: number;

  @Column({ type: 'int', nullable: true })
  pc_usr_id: number;

  @Column({ type: 'int', nullable: true })
  pc_cliu_id: number;

  @Column({ type: 'text' })
  pc_comentario: string;

  @Column({ type: 'bit', default: false })
  pc_es_interno: boolean;

  @CreateDateColumn()
  pc_fecha: Date;

  @CreateDateColumn()
  pc_created_at: Date;

  @UpdateDateColumn()
  pc_updated_at: Date;

  @ManyToOne(() => PQRSEntity, (pqrs) => pqrs.comentarios)
  @JoinColumn({ name: 'pc_pqrs_id' })
  pqrs: PQRSEntity;

  @ManyToOne(() => UsuarioEntity, { nullable: true })
  @JoinColumn({ name: 'pc_usr_id' })
  usuario: UsuarioEntity;

  @ManyToOne(() => ClienteEntity, { nullable: true })
  @JoinColumn({ name: 'pc_cliu_id' })
  cliente: ClienteEntity;
}
