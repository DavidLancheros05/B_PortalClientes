import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { SolicitudEntity } from '../../solicitudes/entities/solicitud.entity';
import { FormularioPregunta } from 'src/parametrizacion/formulario-preguntas/entities/formulario-pregunta.entity';

@Entity('Formulario_respuesta')
export class FormularioRespuestaEntity {
  @PrimaryGeneratedColumn()
  fr_id: number;

  @ManyToOne(() => SolicitudEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fr_solicitud_id' })
  fr_solicitud_id: SolicitudEntity;

  @ManyToOne(() => FormularioPregunta)
  @JoinColumn({ name: 'fr_fp_id' })
  fr_fp_id: FormularioPregunta;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true, name: 'fr_valor_texto' })
  fr_valor_texto: string;

  @Column({ type: 'decimal', nullable: true, name: 'fr_valor_numero' })
  fr_valor_numero: number;

  @Column({ type: 'date', nullable: true, name: 'fr_valor_fecha' })
  fr_valor_fecha: Date;

  @Column({ type: 'int', nullable: true, name: 'fr_valor_opcion_id' })
  fr_valor_opcion_id: number;

  @CreateDateColumn({ name: 'fr_created_at' })
  fr_created_at: Date;

  @UpdateDateColumn({ name: 'fr_updated_at', nullable: true })
  fr_updated_at: Date;

  @Column({ type: 'bit', nullable: true, name: 'fr_es_multiselect' })
  fr_es_multiselect: boolean;

  @Column({ type: 'bit', nullable: true, name: 'fr_completado' })
  fr_completado: boolean;

  @Column({ type: 'nvarchar', nullable: true, name: 'fr_observaciones' })
  fr_observaciones: string;

  @Column({ type: 'int', nullable: true, name: 'fr_actualizado_por' })
  fr_actualizado_por: number;

  @Column({ type: 'int', nullable: true, name: 'fr_valor_archivo_id' })
  fr_valor_archivo_id: number;

  @Column({ type: 'varchar', nullable: true, name: 'fr_valor_catalogo_tipo' })
  fr_valor_catalogo_tipo: string;

  @Column({ type: 'int', nullable: true, name: 'fr_valor_catalogo_id' })
  fr_valor_catalogo_id: number;
}
