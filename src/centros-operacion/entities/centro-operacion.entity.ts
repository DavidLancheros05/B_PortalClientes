import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Centro_operacion', schema: 'dbo' })
export class CentroOperacionEntity {
  @PrimaryGeneratedColumn({ name: 'cop_id' })
  cop_id: number;

  @Column({ name: 'cop_nombre', type: 'varchar', length: 150 })
  cop_nombre: string;

  @Column({ name: 'cop_estado', type: 'varchar', length: 1 })
  cop_estado: string;

  @Column({ name: 'cop_fecha_usr', type: 'datetime2', nullable: true })
  cop_fecha_usr: Date;

  @Column({ name: 'cop_usuario', type: 'varchar', nullable: true })
  cop_usuario: string;

  @Column({ name: 'f285_id', type: 'varchar', length: 10, nullable: true })
  f285_id: string;
}
