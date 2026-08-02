// src/parametrizacion/tipos-documentos/entities/tipo-documento.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('Tipos_documentos')
export class TipoDocumento {
  @PrimaryGeneratedColumn({ name: 'tdo_id' })
  tipoDocumentoId: number;

  @Column({ name: 'tdo_nombre', type: 'varchar', length: 150 })
  nombre: string;

  @Column({
    name: 'tdo_descripcion',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  descripcion: string | null;

  @Column({ name: 'tdo_obligatorio', type: 'bit', default: false })
  obligatorio: boolean;

  @Column({ name: 'tdo_vigencia_dias', type: 'int', nullable: true })
  vigenciaDias: number | null;

  @Column({
    name: 'tdo_regla_vigencia',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  reglaVigencia: string | null;

  @Column({ name: 'tdo_anios_atras_permitidos', type: 'int', nullable: true })
  aniosAtrasPermitidos: number | null;

  @Column({ name: 'tdo_tiene_plantilla', type: 'bit', default: false })
  tienePlantilla: boolean;

  @Column({
    name: 'tdo_plantilla_contenido',
    type: 'nvarchar',
    length: 'MAX',
    nullable: true,
  })
  plantillaContenido: string | null;

  @Column({
    name: 'tdo_tipo_plantilla',
    type: 'varchar',
    length: 20,
    default: 'TEXTO',
  })
  tipoPlantilla: 'TEXTO' | 'PDF_SOLICITUD';

  @Column({ name: 'tdo_permite_vencimiento', type: 'bit', default: false })
  aplicaFechaEmision: boolean;

  @Column({ name: 'tdo_aplica_cliente', type: 'bit', default: true })
  aplicaCliente: boolean;

  @Column({ name: 'tdo_aplica_zona_franca', type: 'bit', default: false })
  aplicaZonaFranca: boolean;

  @Column({ name: 'tdo_estado', type: 'bit', default: true })
  estado: boolean;

  @Column({
    name: 'tdo_formato_codigo',
    type: 'nvarchar',
    length: 30,
    nullable: true,
  })
  formatoCodigo: string | null;

  @Column({
    name: 'tdo_formato_codigo_secundario',
    type: 'nvarchar',
    length: 30,
    nullable: true,
  })
  formatoCodigoSecundario: string | null;

  @Column({
    name: 'tdo_revision',
    type: 'nvarchar',
    length: 10,
    nullable: true,
  })
  revision: string | null;

  @Column({ name: 'tdo_paginas_total', type: 'int', nullable: true })
  paginasTotal: number | null;

  // 'CLIENTE' (default, documento que el cliente sube/descarga-firma-sube
  // durante el formulario) | 'CARTA_APROBACION' (el sistema lo genera y
  // envía solo al aprobar el Comité de Crédito 2 — ver
  // solicitudes-workflow.service.ts::enviarCartaVinculacionPorCorreo). No
  // tiene Formulario_pregunta asociada ni tiene sentido en el flujo del
  // cliente, por eso vive como un origen distinto en la misma tabla en vez
  // de una tabla aparte (que es justo lo que reemplazó esta migración,
  // ver 20260727_unificar_carta_vinculacion_en_tipos_documentos.sql).
  @Column({
    name: 'tdo_origen',
    type: 'varchar',
    length: 20,
    default: 'CLIENTE',
  })
  origen: 'CLIENTE' | 'CARTA_APROBACION';

  // Encabezado que se dibuja arriba de cada página del PDF de este
  // documento. Para origen CARTA_APROBACION lo dibuja el backend (pdfkit,
  // solicitudes-workflow.service.ts) y solo soporta 'NINGUNO'/'IMAGEN' —
  // 'FORMATO_OFICIAL' (tabla logo/código de FORMATO/página/revisión) sigue
  // reservado sin implementar ahí. Para origen CLIENTE con
  // tipoPlantilla='TEXTO' lo dibuja el frontend (pdf-lib,
  // carta-pdf.util.ts), donde sí soporta los 3 valores.
  @Column({
    name: 'tdo_encabezado_tipo',
    type: 'varchar',
    length: 20,
    default: 'NINGUNO',
  })
  encabezadoTipo: 'NINGUNO' | 'IMAGEN' | 'FORMATO_OFICIAL';

  @Column({
    name: 'tdo_encabezado_imagen_url',
    type: 'nvarchar',
    length: 500,
    nullable: true,
  })
  encabezadoImagenUrl: string | null;

  // Pie de página que se dibuja abajo de cada página del PDF — solo
  // implementado para origen CLIENTE con tipoPlantilla='TEXTO' (frontend,
  // pdf-lib, carta-pdf.util.ts). Independiente del bloque de "cierre" de
  // una sola vez (texto fijo + tabla de revisiones) que ya existe al
  // final del documento — este pie se repite en todas las páginas.
  @Column({
    name: 'tdo_pie_pagina_tipo',
    type: 'varchar',
    length: 20,
    default: 'NINGUNO',
  })
  piePaginaTipo: 'NINGUNO' | 'TEXTO' | 'IMAGEN';

  @Column({
    name: 'tdo_pie_pagina_texto',
    type: 'nvarchar',
    length: 300,
    nullable: true,
  })
  piePaginaTexto: string | null;

  @Column({
    name: 'tdo_pie_pagina_imagen_url',
    type: 'nvarchar',
    length: 500,
    nullable: true,
  })
  piePaginaImagenUrl: string | null;

  @CreateDateColumn({ name: 'tdo_created_at', type: 'datetime2' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'tdo_updated_at',
    type: 'datetime2',
    nullable: true,
  })
  updatedAt: Date | null;

  @Column({ name: 'tdo_created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @Column({ name: 'tdo_updated_by', type: 'int', nullable: true })
  updatedBy: number | null;
}
