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
import { FormularioRespuestaEntity } from '../../formulario/respuestas/entities/formulario-respuesta.entity';
import { UsuarioEntity } from 'src/usuarios/entities/usuario.entity';
import { WorkflowEtapaEntity } from '../../workflow/etapas/entities/workflow-etapa.entity';
import { WorkflowResultadoEntity } from '../../workflow/resultados/entities/workflow-resultado.entity';

@Entity('solicitudes')
export class SolicitudEntity {
  @PrimaryGeneratedColumn({ name: 'sol_id' })
  sol_id: number;

  @ManyToOne(() => ClienteEntity)
  @JoinColumn({ name: 'sol_cli_id' })
  sol_cli_id: ClienteEntity;

  @Column({ name: 'sol_ses_id', type: 'int' })
  sol_ses_id: number;

  @ManyToOne(() => UsuarioEntity, { nullable: true })
  @JoinColumn({ name: 'sol_ejng_id' })
  sol_ejng_id: UsuarioEntity;

  @ManyToOne(() => WorkflowEtapaEntity, { nullable: true })
  @JoinColumn({ name: 'sol_wet_id' })
  sol_wet_id: WorkflowEtapaEntity;

  @ManyToOne(() => WorkflowResultadoEntity, { nullable: true })
  @JoinColumn({ name: 'sol_wee_id' })
  sol_wee_id: WorkflowResultadoEntity;

  @Column({ name: 'sol_numero', type: 'varchar', length: 30 })
  sol_numero: string;

  @Column({ name: 'sol_version', type: 'int' })
  sol_version: number;

  @Column({ name: 'sol_formulario_version', type: 'int' })
  sol_formulario_version: number;

  @Column({ name: 'sol_usr_id_crea', type: 'int', nullable: true })
  sol_usr_id_crea: number | null;

  @CreateDateColumn({ name: 'sol_created_at' })
  sol_created_at: Date;

  @UpdateDateColumn({ name: 'sol_updated_at', nullable: true })
  sol_updated_at: Date | null;

  @Column({ name: 'sol_fecha_creacion', type: 'datetime2' })
  sol_fecha_creacion: Date;

  @Column({
    name: 'sol_consumo_mensual_proyectado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  sol_consumo_mensual_proyectado: number | null;

  @Column({
    name: 'sol_toneladas_proyectadas',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  sol_toneladas_proyectadas: number | null;

  @Column({ name: 'sol_mrs_id', type: 'int', nullable: true })
  sol_mrs_id: number | null;

  @Column({ name: 'sol_usr_id_modifica', type: 'int', nullable: true })
  sol_usr_id_modifica: number | null;

  @Column({ name: 'sol_fecha_envio', type: 'datetime2', nullable: true })
  sol_fecha_envio: Date | null;

  // Fecha real de la aprobación final en Comité de Crédito 2 — a diferencia
  // de sol_fecha_gest_cc2 (que se pisa también en rechazo), esta
  // solo se escribe cuando aprobado=true. Fuente de {{fecha_aprobacion}} en
  // Variables de Plantilla (ver solicitudes-workflow.service.ts).
  @Column({
    name: 'sol_fecha_aprobacion',
    type: 'date',
    nullable: true,
  })
  sol_fecha_aprobacion: Date | null;

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
    name: 'sol_usr_id_apr_cond',
    type: 'int',
    nullable: true,
  })
  sol_usr_id_apr_cond: number | null;

  @OneToMany(
    () => FormularioRespuestaEntity,
    (respuesta) => respuesta.fr_sol_id,
    {
      cascade: true,
    },
  )
  respuestas: FormularioRespuestaEntity[];
}
