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

@Entity({ name: 'pc_modulos', schema: 'dbo' })
export class ModuloEntity {
  @PrimaryGeneratedColumn({ name: 'mod_id' })
  mod_id: number;

  @Column({ name: 'mod_nombre', type: 'varchar' })
  mod_nombre: string;

  @Column({ name: 'mod_ruta', type: 'varchar' })
  mod_ruta: string;

  @Column({ name: 'mod_icono', type: 'varchar', nullable: true })
  mod_icono?: string;

  @Column({ name: 'mod_posicion', type: 'int', default: 0 })
  mod_posicion: number;

  @Column({ name: 'mod_padre_id', type: 'int', nullable: true })
  mod_padre_id?: number;

  @ManyToOne(() => ModuloEntity, (modulo) => modulo.subModulos, {
    nullable: true,
  })
  @JoinColumn({ name: 'mod_padre_id' })
  padre: ModuloEntity;

  @OneToMany(() => ModuloEntity, (modulo) => modulo.padre)
  subModulos: ModuloEntity[];

  @Column({ name: 'mod_estado', type: 'bit' })
  mod_activo: boolean;

  @CreateDateColumn({ name: 'mod_created_at' })
  mod_created_at: Date;

  @UpdateDateColumn({ name: 'mod_updated_at' })
  mod_updated_at: Date;
}
