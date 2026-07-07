import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ClienteEntity } from '../../clientes/entities/clientes.entity';
import { CentroOperacionEntity } from './centro-operacion.entity';

@Entity({ name: 'Detalle_cliente_centro', schema: 'dbo' })
export class DetalleClienteCentroEntity {
  @PrimaryGeneratedColumn({ name: 'dclc_id' })
  dclc_id: number;

  @Column({ name: 'cli_id' })
  cli_id: number;

  @Column({ name: 'cop_id' })
  cop_id: number;

  @Column({ name: 'dclc_estado', type: 'varchar', length: 1 })
  dclc_estado: string;

  @Column({ name: 'dclc_fecha_usr', type: 'datetime2', nullable: true })
  dclc_fecha_usr: Date;

  @Column({ name: 'dclc_usuario', type: 'varchar', nullable: true })
  dclc_usuario: string;

  @ManyToOne(() => ClienteEntity)
  @JoinColumn({ name: 'cli_id' })
  cliente: ClienteEntity;

  @ManyToOne(() => CentroOperacionEntity)
  @JoinColumn({ name: 'cop_id' })
  centroOperacion: CentroOperacionEntity;
}
