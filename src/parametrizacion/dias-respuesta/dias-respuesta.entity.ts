import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('param_dias_respuesta_solicitudes')
export class DiaRespuesta {
  @PrimaryGeneratedColumn()
  pdr_id: number;

  // Área real: nombre de una etapa del workflow (wet_nombre), ej.
  // "Ejecutivo Negocios", "Auxiliar Servicio Cliente" — NO valores fijos
  // 'COMERCIAL'/'FINANCIERA' (así estaba antes; no correspondía a ningún
  // dato real y bloqueaba crear SLA para etapas reales vía el DTO).
  @Column({ type: 'varchar', length: 50 })
  pdr_area: string;

  // Llave real hacia la etapa: es lo que usan crearSolicitud y
  // registrarTransicionConSLA para encontrar los días (pdr_area es solo el
  // nombre para mostrar). Se resuelve desde pdr_area al crear/editar.
  @Column({ type: 'int' })
  wet_id: number;

  @Column({ type: 'int' })
  pdr_dias: number;

  @Column({ type: 'bit', default: 1 })
  pdr_estado: boolean;

  @CreateDateColumn({ type: 'datetime' })
  pdr_created_at: Date;
}
