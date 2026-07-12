// src/documentos/entities/documento.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { SolicitudEntity } from '../../../solicitudes/entities/solicitud.entity';
import { TipoDocumento } from '../../../parametrizacion/tipos-documentos/entities/tipo-documento.entity';

@Entity({ name: 'documentos' })
export class Documento {
  @PrimaryGeneratedColumn({ name: 'documento_id' })
  documentoId: number;

  @Column({ name: 'sa_sol_id', type: 'int' })
  solicitudId: number;

  @ManyToOne(() => SolicitudEntity)
  @JoinColumn({ name: 'sa_sol_id' })
  solicitud: SolicitudEntity;

  @Column({ name: 'tipo_documento_id', type: 'int' })
  tipoDocumentoId: number;

  @ManyToOne(() => TipoDocumento)
  @JoinColumn({ name: 'tipo_documento_id' })
  tipoDocumento: TipoDocumento;

  @Column({ name: 'nombre_archivo', type: 'varchar', length: 255 })
  nombreArchivo: string;

  @Column({ name: 'ruta_archivo', type: 'varchar', length: 500 })
  rutaArchivo: string;

  @Column({ name: 'sa_fecha_emision', type: 'datetime', nullable: true })
  fechaEmision?: Date;

  @Column({ name: 'sa_fecha_vencimiento', type: 'datetime', nullable: true })
  fechaVencimiento?: Date;

  @Column({ name: 'hash_archivo', type: 'varchar', length: 64 })
  hashArchivo: string;

  @Column({ name: 'usuario_carga', type: 'int' })
  usuarioCarga: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;
}
