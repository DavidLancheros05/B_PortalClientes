// backend/src/condiciones/condicion-financiera.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('condiciones_financieras')
export class CondicionFinanciera {
  @PrimaryGeneratedColumn()
  condicion_id: number;

  @Column({ type: 'int' })
  solicitud_id: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  cupo: number;

  @Column({ type: 'int' })
  plazo_pago: number;

  @Column({ type: 'varchar', length: 100 })
  forma_pago: string;

  @Column({ type: 'int' })
  usuario_aprueba: number;
}
