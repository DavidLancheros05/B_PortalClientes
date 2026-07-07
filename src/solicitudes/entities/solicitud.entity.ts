import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ClienteEntity } from '../../clientes/entities/clientes.entity';
import { FormularioRespuestaEntity } from './solicitud-respuesta.entity';
import { UsuarioEntity } from 'src/usuarios/entities/usuario.entity';
import { CentroOperacionEntity } from '../../centros-operacion/entities/centro-operacion.entity';
import { WorkflowEtapaEntity } from '../../workflow/etapas/entities/workflow-etapa.entity';
import { WorkflowResultadoEntity } from '../../workflow/resultados/entities/workflow-resultado.entity';

@Entity('solicitudes')
export class SolicitudEntity {
  @PrimaryGeneratedColumn({ name: 'sol_id' })
  sol_id: number;

  @ManyToOne(() => ClienteEntity)
  @JoinColumn({ name: 'sol_cliente_id' })
  sol_cliente_id: ClienteEntity;

  @Column({ name: 'sol_estado_id', type: 'int' })
  sol_estado_id: number;

  @ManyToOne(() => CentroOperacionEntity)
  @JoinColumn({ name: 'sol_co_id' })
  sol_co_id: CentroOperacionEntity;

  @ManyToOne(() => UsuarioEntity, { nullable: true })
  @JoinColumn({ name: 'sol_ejecutivo_id' })
  sol_ejecutivo_id: UsuarioEntity;

  @ManyToOne(() => WorkflowEtapaEntity, { nullable: true })
  @JoinColumn({ name: 'sol_etapa_actual_id' })
  sol_etapa_actual_id: WorkflowEtapaEntity;

  @ManyToOne(() => WorkflowResultadoEntity, { nullable: true })
  @JoinColumn({ name: 'sol_resultado_etapa_id' })
  sol_resultado_etapa_id: WorkflowResultadoEntity;

  @Column({ name: 'sol_numero_solicitud', type: 'varchar', length: 30 })
  sol_numero_solicitud: string;

  @Column({ name: 'sol_version', type: 'int' })
  sol_version: number;

  @Column({ name: 'sol_formulario_version', type: 'int' })
  sol_formulario_version: number;

  @Column({ name: 'sol_usuario_crea', type: 'int', nullable: true })
  sol_usuario_crea: number | null;

  @CreateDateColumn({ name: 'sol_created_at' })
  sol_created_at: Date;

  @UpdateDateColumn({ name: 'sol_updated_at', nullable: true })
  sol_updated_at: Date | null;

  @Column({ name: 'sol_fecha_creacion', type: 'datetime2' })
  sol_fecha_creacion: Date;

  @Column({ name: 'sol_es_zona_franca', type: 'bit', default: false })
  sol_es_zona_franca: boolean;

  @Column({
    name: 'sol_razon_social',
    type: 'nvarchar',
    length: 200,
    nullable: true,
  })
  sol_razon_social: string | null;

  @Column({
    name: 'sol_nit_documento',
    type: 'nvarchar',
    length: 50,
    nullable: true,
  })
  sol_nit_documento: string | null;

  @Column({
    name: 'sol_direccion',
    type: 'nvarchar',
    length: 200,
    nullable: true,
  })
  sol_direccion: string | null;

  @Column({
    name: 'sol_telefono',
    type: 'nvarchar',
    length: 50,
    nullable: true,
  })
  sol_telefono: string | null;

  @Column({
    name: 'sol_consumo_mensual_proyectado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  sol_consumo_mensual_proyectado: number | null;

  @Column({ name: 'sol_motivo_rechazo_id', type: 'int', nullable: true })
  sol_motivo_rechazo_id: number | null;

  @Column({ name: 'sol_usuario_modifica', type: 'int', nullable: true })
  sol_usuario_modifica: number | null;

  @Column({ name: 'sol_fecha_envio', type: 'datetime2', nullable: true })
  sol_fecha_envio: Date | null;

  @Column({
    name: 'sol_fecha_estimada_respuesta_comercial',
    type: 'date',
    nullable: true,
  })
  sol_fecha_estimada_respuesta_comercial: Date | null;

  @Column({
    name: 'sol_fecha_estimada_respuesta',
    type: 'datetime2',
    nullable: true,
  })
  sol_fecha_estimada_respuesta: Date | null;

  @Column({
    name: 'sol_formulario_progreso_porcentaje',
    type: 'int',
    nullable: true,
    default: 0,
  })
  sol_formulario_progreso_porcentaje: number | null;

  @Column({
    name: 'sol_campos_completados',
    type: 'int',
    nullable: true,
    default: 0,
  })
  sol_campos_completados: number | null;

  @Column({
    name: 'sol_campos_totales',
    type: 'int',
    nullable: true,
    default: 0,
  })
  sol_campos_totales: number | null;

  @Column({
    name: 'sol_fecha_inicio_llenado',
    type: 'datetime2',
    nullable: true,
  })
  sol_fecha_inicio_llenado: Date | null;

  @Column({
    name: 'sol_fecha_ultima_respuesta',
    type: 'datetime2',
    nullable: true,
  })
  sol_fecha_ultima_respuesta: Date | null;

  @Column({
    name: 'sol_estado_llenado',
    type: 'varchar',
    length: 20,
    nullable: true,
    default: 'vacio',
  })
  sol_estado_llenado: string | null;

  @Column({
    name: 'sol_fecha_estimada_comite_credito_1_ejecutivo',
    type: 'date',
    nullable: true,
  })
  sol_fecha_estimada_comite_credito_1_ejecutivo: Date | null;

  @Column({
    name: 'sol_fecha_real_comite_credito_1_ejecutivo',
    type: 'date',
    nullable: true,
  })
  sol_fecha_real_comite_credito_1_ejecutivo: Date | null;

  @Column({
    name: 'sol_fecha_estimada_comite_credito_2_ejecutivo',
    type: 'date',
    nullable: true,
  })
  sol_fecha_estimada_comite_credito_2_ejecutivo: Date | null;

  @Column({
    name: 'sol_fecha_real_comite_credito_2_ejecutivo',
    type: 'date',
    nullable: true,
  })
  sol_fecha_real_comite_credito_2_ejecutivo: Date | null;

  @Column({
    name: 'sol_fecha_estimada_comite_credito_1_auxiliar',
    type: 'date',
    nullable: true,
  })
  sol_fecha_estimada_comite_credito_1_auxiliar: Date | null;

  @Column({
    name: 'sol_fecha_real_comite_credito_1_auxiliar',
    type: 'date',
    nullable: true,
  })
  sol_fecha_real_comite_credito_1_auxiliar: Date | null;

  @Column({
    name: 'sol_fecha_estimada_comite_credito_2_auxiliar',
    type: 'date',
    nullable: true,
  })
  sol_fecha_estimada_comite_credito_2_auxiliar: Date | null;

  @Column({
    name: 'sol_fecha_real_comite_credito_2_auxiliar',
    type: 'date',
    nullable: true,
  })
  sol_fecha_real_comite_credito_2_auxiliar: Date | null;

  // Condiciones Financieras (cuando se aprueba en Comité Crédito 2)
  @Column({
    name: 'sol_cupo_aprobado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  sol_cupo_aprobado: number | null;

  @Column({
    name: 'sol_plazo_pago',
    type: 'int',
    nullable: true,
  })
  sol_plazo_pago: number | null;

  @Column({
    name: 'sol_forma_pago',
    type: 'nvarchar',
    length: 100,
    nullable: true,
  })
  sol_forma_pago: string | null;

  @Column({
    name: 'sol_usuario_aprueba_condiciones',
    type: 'int',
    nullable: true,
  })
  sol_usuario_aprueba_condiciones: number | null;

  @OneToMany(
    () => FormularioRespuestaEntity,
    (respuesta) => respuesta.fr_solicitud_id,
    {
      cascade: true,
    },
  )
  respuestas: FormularioRespuestaEntity[];
}
