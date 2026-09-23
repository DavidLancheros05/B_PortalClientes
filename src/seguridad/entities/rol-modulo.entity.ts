import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RoleEntity } from './role.entity';

@Entity('pc_rol_modulo')
export class RolModuloEntity {
  @PrimaryColumn({ name: 'rm_rol_id', type: 'int' })
  rmRolId: number;

  @PrimaryColumn({ name: 'rm_mod_id', type: 'int' })
  rmModId: number;

  @Column({ name: 'rm_ver', type: 'bit', default: true })
  rmVer: boolean;

  @Column({ name: 'rm_crear', type: 'bit', default: false })
  rmCrear: boolean;

  @Column({ name: 'rm_editar', type: 'bit', default: false })
  rmEditar: boolean;

  @Column({ name: 'rm_eliminar', type: 'bit', default: false })
  rmEliminar: boolean;

  @Column({ name: 'rm_aprobar', type: 'bit', default: false })
  rmAprobar: boolean;

  @Column({ name: 'rm_activo', type: 'bit', default: true })
  rmActivo: boolean;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'rm_created_at', nullable: true })
  rmCreatedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date;

  @ManyToOne(() => RoleEntity, (role) => role.modulos)
  @JoinColumn({ name: 'rm_rol_id', referencedColumnName: 'rolId' })
  role: RoleEntity;
}
