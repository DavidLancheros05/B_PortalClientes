import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'Tipos_documentos_revisiones' })
export class TipoDocumentoRevision {
  @PrimaryGeneratedColumn({ name: 'tdr_id' })
  tdrId: number;

  @Column({ name: 'tdr_tdo_id', type: 'int' })
  tipoDocumentoId: number;

  @Column({ name: 'tdr_revision', type: 'nvarchar', length: 10 })
  revision: string;

  @Column({ name: 'tdr_descripcion_cambio', type: 'nvarchar', length: 500 })
  descripcionCambio: string;

  @Column({ name: 'tdr_fecha', type: 'date' })
  fecha: string;

  @Column({ name: 'tdr_orden', type: 'int', default: 0 })
  orden: number;

  @Column({ name: 'tdr_estado', type: 'bit', default: true })
  estado: boolean;

  @CreateDateColumn({ name: 'tdr_created_at', type: 'datetime2' })
  createdAt: Date;
}
