import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Formulario_secciones' })
export class Seccion {
  @PrimaryGeneratedColumn('increment', { name: 'fs_id' })
  fs_id: number;

  @Column({ type: 'nvarchar', length: 100, name: 'fs_nombre' })
  fs_nombre: string;

  @Column({
    type: 'nvarchar',
    length: 500,
    nullable: true,
    name: 'fs_descripcion',
  })
  fs_descripcion: string;

  @Column({ type: 'int', name: 'fs_orden' })
  fs_orden: number;

  @Column({ type: 'bit', default: 1, name: 'fs_activo' })
  fs_activo: boolean;

  @Column({ type: 'bit', default: 0, name: 'fs_oculta_en_formulario' })
  fs_oculta_en_formulario: boolean;

  @Column({ type: 'datetime2', name: 'created_at' })
  created_at: Date;
}
