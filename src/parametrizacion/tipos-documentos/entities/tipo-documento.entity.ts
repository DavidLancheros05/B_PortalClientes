// src/parametrizacion/tipos-documentos/entities/tipo-documento.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('Tipos_documentos')
export class TipoDocumento {
  @PrimaryGeneratedColumn({ name: 'tdo_id' })
  tipoDocumentoId: number;

  @Column({ name: 'tdo_nombre', type: 'varchar', length: 150 })
  nombre: string;

  @Column({
    name: 'tdo_descripcion',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  descripcion: string | null;

  @Column({ name: 'tdo_obligatorio', type: 'bit', default: false })
  obligatorio: boolean;

  @Column({ name: 'tdo_vigencia_dias', type: 'int', nullable: true })
  vigenciaDias: number | null;

  @Column({
    name: 'tdo_regla_vigencia',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  reglaVigencia: string | null;

  @Column({ name: 'tdo_anios_atras_permitidos', type: 'int', nullable: true })
  aniosAtrasPermitidos: number | null;

  @Column({ name: 'tdo_tiene_plantilla', type: 'bit', default: false })
  tienePlantilla: boolean;

  @Column({
    name: 'tdo_plantilla_contenido',
    type: 'nvarchar',
    length: 'MAX',
    nullable: true,
  })
  plantillaContenido: string | null;

  @Column({ name: 'tdo_permite_vencimiento', type: 'bit', default: false })
  aplicaFechaEmision: boolean;

  @Column({ name: 'tdo_aplica_cliente', type: 'bit', default: true })
  aplicaCliente: boolean;

  @Column({ name: 'tdo_aplica_zona_franca', type: 'bit', default: false })
  aplicaZonaFranca: boolean;

  @Column({ name: 'tdo_estado', type: 'bit', default: true })
  estado: boolean;

  @CreateDateColumn({ name: 'tdo_created_at', type: 'datetime2' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'tdo_updated_at',
    type: 'datetime2',
    nullable: true,
  })
  updatedAt: Date | null;

  @Column({ name: 'tdo_created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @Column({ name: 'tdo_updated_by', type: 'int', nullable: true })
  updatedBy: number | null;
}
