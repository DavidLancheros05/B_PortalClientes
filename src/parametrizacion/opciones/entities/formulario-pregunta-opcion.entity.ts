import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FormularioPregunta } from '../../formulario-preguntas/entities/formulario-pregunta.entity';

@Entity({ name: 'Formulario_pregunta_opcion' })
export class FormularioPreguntaOpcion {
  @PrimaryGeneratedColumn()
  fpo_id: number;

  @Column({ type: 'int' })
  fpo_fp_id: number;

  @Column({ type: 'nvarchar', length: 200 })
  fpo_valor: string;

  @Column({ type: 'bit', default: true })
  fpo_estado: boolean;

  // Identidad estable de la opción entre versiones del formulario — fpo_id
  // cambia en cada clonado (IDENTITY), fpo_codigo no (ver
  // migrations/20260727_agregar_fpo_codigo_identidad_opciones_entre_versiones.sql).
  @Column({ type: 'nvarchar', length: 100, nullable: true })
  fpo_codigo: string | null;

  @ManyToOne(() => FormularioPregunta, (fp) => fp.opciones)
  @JoinColumn({ name: 'fpo_fp_id' })
  pregunta: FormularioPregunta;
}
