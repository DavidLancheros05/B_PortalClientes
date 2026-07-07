import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('Consecutivo')
export class ConsecutivoEntity {
  @PrimaryColumn()
  cons_id: number;

  @Column()
  cons_ptc_id: number;

  @Column({ nullable: true })
  cons_cop_id: number;

  @Column()
  cons_numero_actual: number;

  @Column({ length: 1 })
  cons_estado: string;

  @Column({ type: 'datetime2' })
  cons_fecha_usr: Date;

  @Column({ length: 30, nullable: true })
  cons_usuario: string;
}
