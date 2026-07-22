import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly historialWorkflowService: HistorialWorkflowService,
  ) {}

  async obtenerEtapaPorCodigo(codigo: string): Promise<any> {
    const result = await this.dataSource.query(
      `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = @0`,
      [codigo],
    );
    return result[0];
  }

  async obtenerResultadoPorCodigo(codigo: string): Promise<any> {
    const result = await this.dataSource.query(
      `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = @0`,
      [codigo],
    );
    return result[0];
  }

  async registrarTransicion(
    solicitudId: number,
    etapaId: number,
    resultadoId: number,
    usuarioId: number,
    comentario?: string,
  ) {
    console.log(
      `📝 [WorkflowService] Registrando transición: Solicitud ${solicitudId} → Etapa ${etapaId}, Resultado ${resultadoId}`,
    );

    try {
      await this.dataSource.query(
        `
        INSERT INTO solicitud_workflow_historial
        (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario)
        VALUES (@0, @1, @2, @3, @4)
      `,
        [solicitudId, etapaId, resultadoId, usuarioId, comentario || null],
      );

      console.log(`✅ [WorkflowService] Transición registrada`);
    } catch (error) {
      console.error(
        `❌ [WorkflowService] Error registrando transición:`,
        error,
      );
      throw error;
    }
  }

  async obtenerHistorial(solicitudId: number) {
    console.log(
      `📖 [WorkflowService] Obteniendo historial de solicitud ${solicitudId}`,
    );

    try {
      const historial = await this.dataSource.query(
        `
        SELECT
          swh_id,
          swh_sol_id,
          we.wet_codigo AS etapa_codigo,
          we.wet_nombre AS etapa_nombre,
          wr.wee_codigo AS resultado_codigo,
          wr.wee_nombre AS resultado_nombre,
          u.usr_nombre AS nombre,
          swh_comentario,
          swh_fecha
        FROM solicitud_workflow_historial swh
        LEFT JOIN workflow_etapas we ON swh.swh_etapa_id = we.wet_id
        LEFT JOIN workflow_estado_etapa wr ON swh.swh_resultado_id = wr.wee_id
        LEFT JOIN Usuarios u ON swh.swh_usuario_id = u.usr_id
        WHERE swh.swh_sol_id = @0
        ORDER BY swh.swh_fecha DESC
      `,
        [solicitudId],
      );

      console.log(
        `✅ [WorkflowService] Historial obtenido: ${historial.length} registros`,
      );
      return historial;
    } catch (error) {
      console.error(`❌ [WorkflowService] Error obteniendo historial:`, error);
      throw error;
    }
  }

  async cambiarEtapa(
    solicitudId: number,
    etapaId: number,
    resultadoId: number,
    usuarioId: number,
    comentario?: string,
  ) {
    console.log(
      `🔄 [WorkflowService] Cambiando etapa de solicitud ${solicitudId}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Actualizar la solicitud con la nueva etapa y resultado
      await queryRunner.query(
        `
        UPDATE solicitudes
        SET sol_etapa_actual_id = @0,
            sol_resultado_etapa_id = @1,
            sol_updated_at = GETDATE(),
            sol_usuario_modifica = @2
        WHERE sol_id = @3
      `,
        [etapaId, resultadoId, usuarioId, solicitudId],
      );

      // Registrar en historial (incluye la fecha estimada vigente de la
      // nueva etapa, calculada desde este momento real de la transición)
      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        { solicitudId, etapaId, resultadoId, usuarioId, comentario },
      );

      await queryRunner.commitTransaction();
      console.log(`✅ [WorkflowService] Etapa cambiada exitosamente`);

      return { success: true, solicitudId, etapaId, resultadoId };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`❌ [WorkflowService] Error cambiando etapa:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
