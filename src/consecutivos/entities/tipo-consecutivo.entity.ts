import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('Tipo_consecutivo')
export class TipoConsecutivoEntity {
  @PrimaryColumn()
  ptc_id: number;

  @Column({ length: 100 })
  ptc_nombre: string;

  @Column({ length: 255, nullable: true })
  ptc_descripcion: string;

  @Column({ length: 10, nullable: true })
  ptc_prefijo: string;

  @Column({ length: 1 })
  ptc_estado: string;

  @Column({ type: 'datetime2' })
  ptc_fecha_usr: Date;

  @Column({ length: 30, nullable: true })
  ptc_usuario: string;
}
