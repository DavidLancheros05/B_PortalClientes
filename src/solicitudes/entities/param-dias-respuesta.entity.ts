import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('param_dias_respuesta_solicitudes')
export class ParamDiasRespuestaEntity {
  @PrimaryGeneratedColumn('increment')
  pdr_id: number;

  @Column('varchar', { length: 20 })
  pdr_area: string;

  @Column('int')
  pdr_dias: number;

  @Column('bit', { default: true })
  pdr_estado: boolean;

  @Column('datetime2', { default: () => 'GETDATE()' })
  pdr_created_at: Date;
}
