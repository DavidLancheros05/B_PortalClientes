import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UsuarioEntity } from '../../usuarios/entities/usuario.entity';
import { RolEntity } from '../../roles/entities/rol.entity';

@Entity('pc_usuario_rol')
export class UsuarioRolEntity {
  @PrimaryColumn({ name: 'ur_usuario_id' })
  ur_usuario_id: number;

  @PrimaryColumn({ name: 'ur_rol_id' })
  ur_rol_id: number;

  @Column({ name: 'ur_activo', type: 'bit', default: true })
  ur_activo: boolean;

  @Column({ name: 'ur_created_at', type: 'datetime2', nullable: true })
  ur_created_at: Date;

  @Column({ name: 'ur_updated_at', type: 'datetime2', nullable: true })
  ur_updated_at: Date;

  @ManyToOne(() => UsuarioEntity)
  @JoinColumn({ name: 'ur_usuario_id' })
  usuario: UsuarioEntity;

  @ManyToOne(() => RolEntity)
  @JoinColumn({ name: 'ur_rol_id' })
  rol: RolEntity;
}

