import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SolicitudWorkflowHistorialEntity } from './entities/solicitud-workflow-historial.entity';

@Injectable()
export class HistorialWorkflowService {
  constructor(private readonly dataSource: DataSource) {}

  async registrarTransicion(
    solicitudId: number,
    etapaId: number,
    resultadoId: number,
    usuarioId: number,
    comentario?: string,
  ): Promise<any> {
    try {
      // Usar SQL directo para evitar problemas con TypeORM y tedious
      const sql = `
        INSERT INTO solicitud_workflow_historial (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario, swh_fecha)
        VALUES (@0, @1, @2, @3, @4, GETDATE());

        SELECT SCOPE_IDENTITY() AS swh_id;
      `;

      const params = [
        solicitudId,
        etapaId,
        resultadoId,
        usuarioId,
        comentario || null,
      ];

      const result = await this.dataSource.query(sql, params);
      console.log('✅ Transición registrada:', result);

      return { swh_id: result[0]?.swh_id };
    } catch (error) {
      console.error('❌ Error registrando transición:', error.message);
      throw error;
    }
  }

  async obtenerHistorial(solicitudId: number): Promise<any[]> {
    // Las dos queries son independientes entre sí (ambas solo filtran por
    // solicitudId) — se lanzan en paralelo para no pagar dos veces la
    // latencia de red hacia la BD remota.
    const [solicitud, resultado] = await Promise.all([
      this.dataSource.query(
        `
      SELECT
        sol_fecha_creacion,
        COALESCE(c.cli_razon_social COLLATE SQL_Latin1_General_CP1_CI_AS, s.sol_razon_social, 'Cliente') as cliente_nombre
      FROM solicitudes s
      LEFT JOIN Clientes c ON s.sol_cliente_id = c.cli_id
      WHERE s.sol_id = @0
    `,
        [solicitudId],
      ),
      this.dataSource.query(
        `
      SELECT
        swh.swh_id as historialId,
        swh.swh_sol_id as solicitudId,
        swh.swh_fecha as fecha,
        swh.swh_comentario as comentario,
        we.wet_id as etapaId,
        we.wet_nombre as etapaNombre,
        we.wet_codigo as etapaCodigo,
        wr.wee_id as resultadoId,
        wr.wee_nombre as resultadoNombre,
        wr.wee_codigo as resultadoCodigo,
        u.usr_id as usuarioId,
        u.usr_nombre as usuarioNombre,
        u.usr_correo as usuarioCorreo
      FROM solicitud_workflow_historial swh
      LEFT JOIN workflow_etapas we ON swh.swh_etapa_id = we.wet_id
      LEFT JOIN workflow_estado_etapa wr ON swh.swh_resultado_id = wr.wee_id
      LEFT JOIN usuarios u ON swh.swh_usuario_id = u.usr_id
      WHERE swh.swh_sol_id = @0
      ORDER BY swh.swh_fecha ASC
    `,
        [solicitudId],
      ),
    ]);

    // Agregar etapa de creación como primera entrada
    if (solicitud?.[0]?.sol_fecha_creacion) {
      const clienteName = solicitud[0].cliente_nombre || 'Cliente';
      const etapaCreacion = {
        historialId: 0,
        solicitudId: solicitudId,
        fecha: solicitud[0].sol_fecha_creacion,
        comentario: null,
        etapaId: 1,
        etapaNombre: 'Creación',
        etapaCodigo: 'CREACION',
        resultadoId: null,
        resultadoNombre: null,
        resultadoCodigo: null,
        usuarioId: null,
        usuarioNombre: clienteName,
        usuarioCorreo: null,
      };

      return [etapaCreacion, ...resultado];
    }

    return resultado;
  }

  async obtenerUltimaTransicion(solicitudId: number): Promise<any | null> {
    const resultado = await this.dataSource.query(
      `
      SELECT TOP 1
        swh.swh_id as historialId,
        swh.swh_sol_id as solicitudId,
        swh.swh_fecha as fecha,
        swh.swh_comentario as comentario,
        we.wet_id as etapaId,
        we.wet_nombre as etapaNombre,
        we.wet_codigo as etapaCodigo,
        wr.wee_id as resultadoId,
        wr.wee_nombre as resultadoNombre,
        wr.wee_codigo as resultadoCodigo,
        u.usr_id as usuarioId,
        u.usr_nombre as usuarioNombre,
        u.usr_correo as usuarioCorreo
      FROM solicitud_workflow_historial swh
      LEFT JOIN workflow_etapas we ON swh.swh_etapa_id = we.wet_id
      LEFT JOIN workflow_estado_etapa wr ON swh.swh_resultado_id = wr.wee_id
      LEFT JOIN usuarios u ON swh.swh_usuario_id = u.usr_id
      WHERE swh.swh_sol_id = @0
      ORDER BY swh.swh_fecha DESC
    `,
      [solicitudId],
    );

    return resultado?.[0] || null;
  }
}
