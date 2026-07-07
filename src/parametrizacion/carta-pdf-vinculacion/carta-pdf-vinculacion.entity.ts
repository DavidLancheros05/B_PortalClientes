import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('param_carta_pdf_vinculacion')
export class CartaPdfVinculacion {
  @PrimaryGeneratedColumn()
  cpv_id: number;

  @Column({ type: 'varchar', length: 255 })
  cpv_nombre: string;

  @Column({ type: 'nvarchar', length: -1 })
  cpv_contenido: string;

  @Column({ type: 'bit', default: 1 })
  cpv_activo: boolean;

  @CreateDateColumn({ type: 'datetime2' })
  cpv_created_at: Date;

  @UpdateDateColumn({ type: 'datetime2' })
  cpv_updated_at: Date;
}
