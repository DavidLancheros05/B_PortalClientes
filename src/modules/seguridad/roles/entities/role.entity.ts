import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { RolModuloEntity } from './rol-modulo.entity';

@Entity('pc_roles')
export class RoleEntity {
  @PrimaryColumn({ name: 'rol_id', type: 'int' })
  rolId: number;

  @Column({ name: 'rol_nombre', type: 'varchar', length: 50 })
  rolNombre: string;

  @Column({
    name: 'rol_descripcion',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  rolDescripcion: string;

  @Column({ name: 'rol_codigo', type: 'varchar', length: 50 })
  rolCodigo: string;

  @Column({ name: 'rol_activo', type: 'bit', default: true })
  rolActivo: boolean;

  @CreateDateColumn({ name: 'rol_created_at' })
  rolCreatedAt: Date;

  @UpdateDateColumn({ name: 'rol_updated_at', nullable: true })
  rolUpdatedAt: Date;

  @OneToMany(() => RolModuloEntity, (rolModulo) => rolModulo.role)
  modulos: RolModuloEntity[];
}
