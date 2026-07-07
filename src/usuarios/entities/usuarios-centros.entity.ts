import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  CreateDateColumn,
} from 'typeorm';
import { UsuarioEntity } from './usuario.entity';
import { CentroOperacionEntity } from '../../centros-operacion/entities/centro-operacion.entity';

@Entity('usuarios_centros_operacion')
@Unique(['uco_usr_id', 'uco_co_id'])
export class UsuariosCentrosEntity {
  @PrimaryGeneratedColumn({ name: 'uco_id' })
  uco_id: number;

  @ManyToOne(() => UsuarioEntity, (usuario) => usuario.centros)
  @JoinColumn({ name: 'uco_usr_id' })
  uco_usr_id: UsuarioEntity;

  @ManyToOne(() => CentroOperacionEntity)
  @JoinColumn({ name: 'uco_co_id' })
  uco_co_id: CentroOperacionEntity;

  @Column({ name: 'uco_es_default', type: 'bit', default: false })
  es_default: boolean;

  @CreateDateColumn({ name: 'uco_created_at' })
  created_at: Date;
}
