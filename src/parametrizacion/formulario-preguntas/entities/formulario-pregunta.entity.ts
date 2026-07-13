import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { FormularioPreguntaOpcion } from '../../opciones/entities/formulario-pregunta-opcion.entity';
import { Seccion } from '../../formulario-secciones/entities/seccion.entity';

export enum TipoPregunta {
  NOTA = 'NOTA',
  FECHA_HORA_ACTUAL = 'FECHA_HORA_ACTUAL',
  TEXTO = 'TEXTO',
  NUMERO = 'NUMERO',
  FECHA = 'FECHA',
  LISTA = 'LISTA',
  SELECT = 'SELECT',
  SELECT_TABLA = 'SELECT_TABLA',
  DOCUMENTOS_TABLA = 'DOCUMENTOS_TABLA',
  MULTISELECT = 'MULTISELECT',
  SELECT_CONDICIONAL = 'SELECT_CONDICIONAL',
  ARCHIVO = 'ARCHIVO',
  TABLA = 'TABLA',
  IMAGEN = 'IMAGEN',
  ESPACIO_FIRMA = 'ESPACIO_FIRMA',
}

@Entity({ name: 'Formulario_pregunta' })
export class FormularioPregunta {
  @PrimaryGeneratedColumn()
  fp_id: number;

  @Column({ type: 'nvarchar', length: 'MAX' })
  fp_descripcion: string;

  @Column({ type: 'nvarchar', length: 100, nullable: true })
  fp_codigo: string | null;

  @Column({ type: 'varchar', length: 20 })
  fp_tipo: TipoPregunta;

  @Column({ type: 'bit', default: true })
  fp_estado: boolean;

  @Column({ type: 'int' })
  fp_orden: number;

  @Column({ type: 'int' })
  fp_version: number;

  @CreateDateColumn({ type: 'datetime2' })
  fp_created_at: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fp_precarga_fuente: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fp_precarga_campo_cliente: string | null;

  @Column({ type: 'int', nullable: true })
  formulario_id: number | null;

  @Column({ type: 'int', nullable: true })
  seccion_id: number | null;

  @Column({ type: 'bit', default: false })
  fp_requerida: boolean;

  @Column({ type: 'int', nullable: true })
  fp_minimo: number | null;

  @Column({ type: 'int', nullable: true })
  fp_maximo: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  fp_subtipo: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fp_patron: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fp_catalogo_base_datos: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fp_catalogo_tabla: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fp_catalogo_columna: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fp_catalogo_pk_column: string | null;

  @Column({ type: 'int', nullable: true })
  fp_tipo_documento_id: number | null;

  @Column({ type: 'int', nullable: true })
  fp_pregunta_padre_id: number | null;

  @Column({ type: 'nvarchar', length: 500, nullable: true })
  fp_valor_padre_disparador: string | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  fp_tabla_columnas: string | null;

  @Column({ type: 'bit', default: false })
  fp_ancho_completo: boolean;

  @Column({ type: 'varchar', length: 20, nullable: true })
  fp_tabla_limite_modo: string | null;

  @Column({ type: 'int', nullable: true })
  fp_tabla_limite_pregunta_id: number | null;

  @Column({ type: 'nvarchar', length: 'MAX', nullable: true })
  fp_tabla_limite_reglas: string | null;

  @Column({ type: 'bit', default: false })
  fp_oculto_en_formulario: boolean;

  @ManyToOne(() => Seccion, { nullable: true })
  @JoinColumn({ name: 'seccion_id' })
  seccion: Seccion;

  @OneToMany(() => FormularioPreguntaOpcion, (op) => op.pregunta)
  opciones: FormularioPreguntaOpcion[];
}
