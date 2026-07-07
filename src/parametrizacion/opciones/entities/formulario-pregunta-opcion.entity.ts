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

  @ManyToOne(() => FormularioPregunta, (fp) => fp.opciones)
  @JoinColumn({ name: 'fpo_fp_id' })
  pregunta: FormularioPregunta;
}
