import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('pc_roles')
export class RolEntity {
  @PrimaryGeneratedColumn({ name: 'rol_id' })
  rol_id: number;

  @Column({ name: 'rol_nombre', type: 'varchar', length: 50 })
  rol_nombre: string;

  @Column({ name: 'rol_codigo', type: 'varchar', length: 50 })
  rol_codigo: string;

  @Column({
    name: 'rol_descripcion',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  rol_descripcion: string;

  @Column({ name: 'rol_activo', type: 'bit', default: true })
  rol_activo: boolean;

  @Column({ name: 'rol_created_at', type: 'datetime2' })
  rol_created_at: Date;

  @Column({ name: 'rol_updated_at', type: 'datetime2', nullable: true })
  rol_updated_at: Date;
}
