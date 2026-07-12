// src/parametrizacion/tipos-vigencia/entities/tipo-vigencia.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('Tipos_vigencia')
export class TipoVigencia {
  @PrimaryGeneratedColumn({ name: 'tv_id' })
  tipoVigenciaId: number;

  @Column({ name: 'tv_codigo', type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ name: 'tv_nombre', type: 'varchar', length: 150 })
  nombre: string;

  @Column({
    name: 'tv_descripcion',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  descripcion: string | null;

  @Column({ name: 'tv_estado', type: 'bit', default: true })
  estado: boolean;

  @Column({ name: 'tv_orden', type: 'int', default: 0 })
  orden: number;

  @CreateDateColumn({ name: 'tv_created_at', type: 'datetime2' })
  createdAt: Date;
}
