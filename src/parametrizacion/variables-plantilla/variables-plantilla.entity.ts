import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

// Catálogo de variables ({{placeholder}}) que se pueden insertar en el
// contenido de una plantilla de Tipos_documentos. Antes vivían hardcodeadas
// en el frontend (VARIABLES_FIJAS / VARIABLES_CARTA_VINCULACION en
// plantilla-variables.util.ts) — se movieron acá para que agregar/quitar una
// variable sea una acción administrable (con guardrail de borrado) y no un
// cambio de código sin trazabilidad. Ver Documentos Cartonera/documentacion/
// Portal Clientes/Funcionalidades/plantillas/variables-plantilla.md.
@Entity('param_variables_plantilla')
export class VariablePlantilla {
  @PrimaryGeneratedColumn()
  pvp_id: number;

  // Formato exacto "{{algo}}" — validado en el DTO, único.
  @Column({ type: 'varchar', length: 60, unique: true })
  pvp_placeholder: string;

  @Column({ type: 'varchar', length: 100 })
  pvp_etiqueta: string;

  // A qué familia de documentos aplica: 'FIJA' (cualquier Tipos_documentos
  // con origen='CLIENTE', ej. {{cliente_nombre}}) o 'CARTA_APROBACION'
  // (solo la Carta de Vinculación, ej. {{cupo_aprobado}}).
  @Column({ type: 'varchar', length: 20 })
  pvp_ambito: 'FIJA' | 'CARTA_APROBACION';

  // ¿Ya existe código que resuelva este placeholder con un dato real? Si es
  // false, la variable existe en el catálogo pero el editor de plantillas
  // NO la ofrece como botón para insertar — evita repetir el caso real de
  // {{tasa_interes}}: una variable "disponible" sin ningún campo real
  // detrás. Un desarrollador la marca en true solo después de conectarla
  // de verdad (ver carta-pdf.util.ts / solicitudes-workflow.service.ts).
  @Column({ type: 'bit', default: 0 })
  pvp_resuelta: boolean;

  @Column({ type: 'bit', default: 1 })
  pvp_estado: boolean;

  // Mapeo real de dónde sale el dato, para resolver la variable
  // automáticamente al generar un PDF — ver
  // VariablesPlantillaService.resolverParaSolicitud(). Solo dos tablas
  // "ancla" permitidas (whitelist validado en el service, no solo acá):
  // 'solicitudes' (directo por sol_id) y 'clientes' (vía
  // solicitudes.sol_cliente_id). Si están en null, la variable sigue
  // resolviéndose a mano en código (ej. representante_legal_*,
  // fecha_aprobacion, que no son una columna fija).
  @Column({ type: 'varchar', length: 20, nullable: true })
  pvp_tabla_origen: 'solicitudes' | 'clientes' | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pvp_columna_origen: string | null;

  @Column({ type: 'varchar', length: 20, default: 'TEXTO' })
  pvp_formato: 'TEXTO' | 'MONEDA' | 'DIAS' | 'FECHA';

  @CreateDateColumn({ type: 'datetime' })
  pvp_created_at: Date;
}
