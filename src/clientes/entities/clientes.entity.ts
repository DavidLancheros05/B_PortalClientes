import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'Clientes', schema: 'dbo' })
export class ClienteEntity {
  @PrimaryGeneratedColumn({ name: 'cli_id' })
  cli_id: number;

  @Column({ name: 'cli_razon_social', type: 'nvarchar', length: 150 })
  cli_razon_social: string;

  @Column({ name: 'cli_nro_identificacion', type: 'nvarchar', length: 30 })
  cli_nro_identificacion: string;

  @Column({
    name: 'cli_tipo_identificacion',
    type: 'int',
  })
  cli_tipo_identificacion: number;

  @Column({
    name: 'cli_direccion',
    type: 'nvarchar',
    length: 150,
  })
  cli_direccion: string;

  @Column({
    name: 'cli_correo',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  cli_correo: string;

  @Column({
    name: 'cli_acceso_portal_clientes',
    type: 'bit',
    nullable: true,
    default: 0,
  })
  cli_acceso_portal_clientes: boolean;

  @Column({
    name: 'ejng_id',
    type: 'int',
  })
  ejng_id: number;

  @Column({
    name: 'cli_estado',
    type: 'nvarchar',
    length: 1,
  })
  cli_estado: string;
}
