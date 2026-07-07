import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('param_dias_respuesta_solicitudes')
export class DiaRespuesta {
  @PrimaryGeneratedColumn()
  pdr_id: number;

  @Column({ type: 'varchar', length: 20 })
  pdr_area: 'COMERCIAL' | 'FINANCIERA';

  @Column({ type: 'int' })
  pdr_dias: number;

  @Column({ type: 'bit', default: 1 })
  pdr_estado: boolean;

  @CreateDateColumn({ type: 'datetime' })
  pdr_created_at: Date;
}
