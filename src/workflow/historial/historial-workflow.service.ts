import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { SolicitudWorkflowHistorialEntity } from './entities/solicitud-workflow-historial.entity';
import { addBusinessDays } from '../../common/utils/business-days.util';

@Injectable()
export class HistorialWorkflowService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Registra una transición de etapa y calcula, en el mismo momento en que
   * la solicitud entra realmente a esa etapa, la fecha estimada "vigente"
   * según los días de respuesta configurados para ella (swh_fecha_estimada).
   * A diferencia de las 5 columnas sol_fecha_estimada_* de `solicitudes`
   * (que se fijan una sola vez al crear la solicitud), esto queda como una
   * fila nueva de historial por transición, así que nunca sobrescribe nada.
   *
   * Debe llamarse con el queryRunner de la transacción ya abierta por el
   * caller (todos los sitios que cambian de etapa ya abren una).
   */
  async registrarTransicionConSLA(
    queryRunner: QueryRunner,
    params: {
      solicitudId: number;
      etapaId: number;
      resultadoId: number;
      usuarioId: number;
      comentario?: string;
    },
  ): Promise<{ swh_id: number; fechaEstimada: Date | null }> {
    const { solicitudId, etapaId, resultadoId, usuarioId, comentario } =
      params;

    const [etapa] = await queryRunner.query(
      `SELECT wet_nombre FROM workflow_etapas WHERE wet_id = @0`,
      [etapaId],
    );
    const areaEtapa = etapa?.wet_nombre;

    let dias: number | null = null;
    if (areaEtapa) {
      const [diasResult] = await queryRunner.query(
        `
        SELECT TOP 1 pdr_dias
        FROM param_dias_respuesta_solicitudes
        WHERE pdr_estado = 1
          AND UPPER(LTRIM(RTRIM(pdr_area))) = UPPER(LTRIM(RTRIM(@0)))
        ORDER BY pdr_id DESC
      `,
        [areaEtapa],
      );
      dias = diasResult?.pdr_dias != null ? Number(diasResult.pdr_dias) : null;
    }

    let fechaEstimada: Date | null = null;
    if (dias != null) {
      const [solicitud] = await queryRunner.query(
        `SELECT sol_co_id FROM solicitudes WHERE sol_id = @0`,
        [solicitudId],
      );
      const coId = solicitud?.sol_co_id ?? null;

      let festivos: any[] = [];
      try {
        const festivosResult = await queryRunner.query(
          `SELECT fes_fecha AS fecha FROM Festivos WHERE fes_co_id = @0 OR fes_co_id IS NULL`,
          [coId],
        );
        festivos = (festivosResult || [])
          .map((row: any) => row?.fecha)
          .filter((value: any) => Boolean(value));
      } catch {
        festivos = [];
      }

      let diasNoHabilesSemana: number[] | undefined;
      try {
        const diasNoHabilesResult = await queryRunner.query(
          `SELECT dsh_dia_semana AS dia FROM param_dias_no_habiles_semana WHERE (dsh_co_id = @0 OR dsh_co_id IS NULL) AND dsh_activo = 1`,
          [coId],
        );
        diasNoHabilesSemana = (diasNoHabilesResult || [])
          .map((row: any) => Number(row?.dia))
          .filter((value: number) => !Number.isNaN(value));
      } catch {
        diasNoHabilesSemana = undefined;
      }

      fechaEstimada = addBusinessDays(
        new Date(),
        dias,
        festivos,
        diasNoHabilesSemana,
      );
    }

    const result = await queryRunner.query(
      `
      INSERT INTO solicitud_workflow_historial
      (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario, swh_fecha, swh_fecha_estimada)
      VALUES (@0, @1, @2, @3, @4, GETDATE(), @5);

      SELECT SCOPE_IDENTITY() AS swh_id;
    `,
      [solicitudId, etapaId, resultadoId, usuarioId, comentario || null, fechaEstimada],
    );

    return { swh_id: result[0]?.swh_id, fechaEstimada };
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
        -- Dos estimados distintos, ambos en días hábiles:
        -- 1) "desde inicio": columna fija sol_fecha_estimada_* calculada UNA
        --    sola vez al crear la solicitud (creación + dias SLA de esa
        --    etapa) — no se mueve aunque la solicitud se demore en etapas
        --    anteriores. No existe para CREACION/CLI (no tienen columna).
        CASE we.wet_codigo
          WHEN 'EJN' THEN s.sol_fecha_estimada_ejecutivo
          WHEN 'ASC' THEN s.sol_fecha_estimada_auxiliar_servicio_cliente
          WHEN 'OFC' THEN s.sol_fecha_estimada_oficial_cumplimiento
          WHEN 'CC1' THEN s.sol_fecha_estimada_comite_credito_1
          WHEN 'CC2' THEN s.sol_fecha_estimada_comite_credito_2
          ELSE NULL
        END as fechaEstimadaInicio,
        -- 2) "desde etapa anterior": swh_fecha_estimada, calculada en
        --    registrarTransicionConSLA en el momento real en que la
        --    solicitud ENTRÓ a esta etapa (fecha de esa entrada + dias SLA
        --    de esta etapa) — sí refleja demoras acumuladas. Puede ser NULL
        --    si no hay una fila configurada en
        --    param_dias_respuesta_solicitudes para el nombre de esta etapa.
        swh.swh_fecha_estimada as fechaEstimadaEtapaAnterior,
        swh.swh_comentario as comentario,
        we.wet_id as etapaId,
        we.wet_nombre as etapaNombre,
        we.wet_codigo as etapaCodigo,
        wr.wee_id as resultadoId,
        wr.wee_nombre as resultadoNombre,
        wr.wee_codigo as resultadoCodigo,
        u.usr_id as usuarioId,
        COALESCE(u.usr_nombre, cli.cli_razon_social) as usuarioNombre,
        COALESCE(u.usr_correo, cli.cli_correo) as usuarioCorreo
      FROM solicitud_workflow_historial swh
      LEFT JOIN solicitudes s ON s.sol_id = swh.swh_sol_id
      LEFT JOIN workflow_etapas we ON swh.swh_etapa_id = we.wet_id
      LEFT JOIN workflow_estado_etapa wr ON swh.swh_resultado_id = wr.wee_id
      -- swh_usuario_id mezcla dos espacios de IDs distintos: usr_id
      -- (personal interno, tabla usuarios) cuando quien actúa es staff, o
      -- cli_id (tabla Clientes) cuando quien actúa es el cliente mismo
      -- (enviar formulario, subir documentos diferidos) — sin este segundo
      -- JOIN, cualquier transición disparada por el cliente queda sin
      -- nombre en el historial porque usr_id nunca matchea un cli_id.
      LEFT JOIN usuarios u ON swh.swh_usuario_id = u.usr_id
      LEFT JOIN Clientes cli ON swh.swh_usuario_id = cli.cli_id
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
        fechaEstimada: null,
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
}
