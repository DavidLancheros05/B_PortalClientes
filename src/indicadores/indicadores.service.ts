import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface AreaKPI {
  area: string;
  label: string;
  total: number;
  a_tiempo: number;
  vencidas: number;
  dias_promedio_real: number;
  dias_promedio_estimado: number;
  pct_cumplimiento: number;
}

export interface SolicitudDetalle {
  sol_id: number;
  numero_solicitud: string;
  razon_social: string;
  fecha_envio: string;
  fecha_estimada: string;
  fecha_real: string;
  dias_reales: number;
  dias_estimados: number;
  diferencia: number;
  estado: 'a_tiempo' | 'vencida';
}

export interface MesTendencia {
  mes: string;
  total: number;
  aprobadas: number;
  rechazadas: number;
}

@Injectable()
export class IndicadoresService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getCumplimiento(query: {
    fecha_desde?: string;
    fecha_hasta?: string;
    co_id?: string;
  }) {
    const fechaDesde = query.fecha_desde || null;
    const fechaHasta = query.fecha_hasta || null;
    const coId = query.co_id ? parseInt(query.co_id, 10) : null;

    const [resumen, porArea, porMes] = await Promise.all([
      this.queryResumen(fechaDesde, fechaHasta, coId),
      this.queryPorArea(fechaDesde, fechaHasta, coId),
      this.queryPorMes(coId),
    ]);

    const totalConFecha = porArea.reduce((acc, a) => acc + (a.total || 0), 0);
    const totalATiempo = porArea.reduce((acc, a) => acc + (a.a_tiempo || 0), 0);
    const pct_a_tiempo_global =
      totalConFecha > 0 ? Math.round((totalATiempo / totalConFecha) * 100) : 0;

    return {
      resumen: { ...resumen, pct_a_tiempo_global },
      por_area: porArea,
      por_mes: porMes,
    };
  }

  private async queryResumen(
    fechaDesde: string | null,
    fechaHasta: string | null,
    coId: number | null,
  ) {
    const sql = `
      SELECT
        COUNT(*) AS total_solicitudes,
        SUM(CASE WHEN sol_estado_id = 3 THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN sol_estado_id = 4 THEN 1 ELSE 0 END) AS rechazadas,
        SUM(CASE WHEN sol_estado_id IN (2) THEN 1 ELSE 0 END) AS pendientes
      FROM solicitudes
      WHERE sol_estado_id != 1
        AND (@0 IS NULL OR sol_fecha_envio >= @0)
        AND (@1 IS NULL OR sol_fecha_envio <= @1)
        AND (@2 IS NULL OR sol_co_id = @2)
    `;
    const rows = await this.dataSource.query(sql, [
      fechaDesde,
      fechaHasta,
      coId,
    ]);
    const r = rows[0] || {};
    return {
      total_solicitudes: Number(r.total_solicitudes || 0),
      aprobadas: Number(r.aprobadas || 0),
      rechazadas: Number(r.rechazadas || 0),
      pendientes: Number(r.pendientes || 0),
    };
  }

  private async queryPorArea(
    fechaDesde: string | null,
    fechaHasta: string | null,
    coId: number | null,
  ): Promise<AreaKPI[]> {
    const areas = [
      {
        area: 'EJECUTIVO',
        label: 'Ejecutivo de Negocios',
        col_real: 'sol_fecha_real_ejecutivo',
        col_est: 'sol_fecha_estimada_ejecutivo',
        wet_codigo: 'EJN',
      },
      {
        area: 'AUXILIAR_SC',
        label: 'Auxiliar Serv. Cliente',
        col_real: 'sol_fecha_real_auxiliar_servicio_cliente',
        col_est: 'sol_fecha_estimada_auxiliar_servicio_cliente',
        wet_codigo: 'ASC',
      },
      {
        area: 'OFICIAL_CUMPLIMIENTO',
        label: 'Oficial de Cumplimiento',
        col_real: 'sol_fecha_real_oficial_cumplimiento',
        col_est: 'sol_fecha_estimada_oficial_cumplimiento',
        wet_codigo: 'OFC',
      },
      {
        area: 'COMITE_1',
        label: 'Comité de Crédito 1',
        col_real: 'sol_fecha_real_comite_credito_1',
        col_est: 'sol_fecha_estimada_comite_credito_1',
        wet_codigo: 'CC1',
      },
      {
        area: 'COMITE_2',
        label: 'Comité de Crédito 2',
        col_real: 'sol_fecha_real_comite_credito_2',
        col_est: 'sol_fecha_estimada_comite_credito_2',
        wet_codigo: 'CC2',
      },
    ];

    const results: AreaKPI[] = [];

    for (const a of areas) {
      // fecha_estimada "vigente": la que quedó registrada en el historial en
      // el momento real en que la solicitud entró a esta etapa. Si esa fila
      // de historial es anterior a que existiera esta columna (o no hay
      // días de SLA configurados), cae de vuelta a la columna fija de
      // `solicitudes` (estimación inicial calculada al crear la solicitud).
      const sql = `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN s.${a.col_real} <= COALESCE(fe.swh_fecha_estimada, s.${a.col_est}) THEN 1 ELSE 0 END) AS a_tiempo,
          SUM(CASE WHEN s.${a.col_real} > COALESCE(fe.swh_fecha_estimada, s.${a.col_est}) THEN 1 ELSE 0 END) AS vencidas,
          AVG(CAST(DATEDIFF(day, s.sol_fecha_envio, s.${a.col_real}) AS FLOAT)) AS dias_promedio_real,
          AVG(CAST(DATEDIFF(day, s.sol_fecha_envio, COALESCE(fe.swh_fecha_estimada, s.${a.col_est})) AS FLOAT)) AS dias_promedio_estimado
        FROM solicitudes s
        OUTER APPLY (
          SELECT TOP 1 swh.swh_fecha_estimada
          FROM solicitud_workflow_historial swh
          WHERE swh.swh_sol_id = s.sol_id
            AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = '${a.wet_codigo}')
          ORDER BY swh.swh_fecha DESC
        ) fe
        WHERE s.${a.col_real} IS NOT NULL
          AND (@0 IS NULL OR s.sol_fecha_envio >= @0)
          AND (@1 IS NULL OR s.sol_fecha_envio <= @1)
          AND (@2 IS NULL OR s.sol_co_id = @2)
      `;
      const rows = await this.dataSource.query(sql, [
        fechaDesde,
        fechaHasta,
        coId,
      ]);
      const r = rows[0] || {};
      const total = Number(r.total || 0);
      const a_tiempo = Number(r.a_tiempo || 0);

      results.push({
        area: a.area,
        label: a.label,
        total,
        a_tiempo,
        vencidas: Number(r.vencidas || 0),
        dias_promedio_real:
          r.dias_promedio_real != null
            ? Math.round(r.dias_promedio_real * 10) / 10
            : 0,
        dias_promedio_estimado:
          r.dias_promedio_estimado != null
            ? Math.round(r.dias_promedio_estimado * 10) / 10
            : 0,
        pct_cumplimiento: total > 0 ? Math.round((a_tiempo / total) * 100) : 0,
      });
    }

    return results;
  }

  async getSolicitudTimeline(query: { numero?: string; sol_id?: string }) {
    const byId = query.sol_id ? parseInt(query.sol_id, 10) : null;
    const byNumero = query.numero?.trim() || null;

    if (!byId && !byNumero)
      throw new Error('Debes indicar sol_id o numero de solicitud');

    const sql = `
      SELECT TOP 1
        s.sol_id,
        s.sol_numero_solicitud,
        ISNULL(s.sol_razon_social, '') AS razon_social,
        ISNULL(s.sol_nit_documento, '') AS nit,
        CONVERT(varchar(10), s.sol_fecha_envio, 23) AS fecha_envio,
        co.cop_nombre AS centro_operacion,
        ISNULL(se.ses_codigo, '') AS estado,

        -- EJECUTIVO
        CONVERT(varchar(10), COALESCE(fe_ejn.swh_fecha_estimada, s.sol_fecha_estimada_ejecutivo), 23) AS est_ejecutivo,
        CONVERT(varchar(10), s.sol_fecha_real_ejecutivo, 23) AS real_ejecutivo,

        -- AUXILIAR SC
        CONVERT(varchar(10), COALESCE(fe_asc.swh_fecha_estimada, s.sol_fecha_estimada_auxiliar_servicio_cliente), 23) AS est_auxiliar_sc,
        CONVERT(varchar(10), s.sol_fecha_real_auxiliar_servicio_cliente, 23) AS real_auxiliar_sc,

        -- OFICIAL CUMPLIMIENTO
        CONVERT(varchar(10), COALESCE(fe_ofc.swh_fecha_estimada, s.sol_fecha_estimada_oficial_cumplimiento), 23) AS est_oficial,
        CONVERT(varchar(10), s.sol_fecha_real_oficial_cumplimiento, 23) AS real_oficial,

        -- COMITE 1
        CONVERT(varchar(10), COALESCE(fe_cc1.swh_fecha_estimada, s.sol_fecha_estimada_comite_credito_1), 23) AS est_comite1,
        CONVERT(varchar(10), s.sol_fecha_real_comite_credito_1, 23) AS real_comite1,

        -- COMITE 2
        CONVERT(varchar(10), COALESCE(fe_cc2.swh_fecha_estimada, s.sol_fecha_estimada_comite_credito_2), 23) AS est_comite2,
        CONVERT(varchar(10), s.sol_fecha_real_comite_credito_2, 23) AS real_comite2,

        -- SLAs configurados
        (SELECT TOP 1 pdr_dias FROM param_dias_respuesta_solicitudes WHERE UPPER(LTRIM(RTRIM(pdr_area))) = 'COMERCIAL' AND pdr_estado = 1 ORDER BY pdr_id DESC) AS sla_comercial

      FROM solicitudes s
      LEFT JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
      LEFT JOIN solicitud_estados se ON s.sol_estado_id = se.ses_id
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN')
        ORDER BY swh.swh_fecha DESC
      ) fe_ejn
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'ASC')
        ORDER BY swh.swh_fecha DESC
      ) fe_asc
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'OFC')
        ORDER BY swh.swh_fecha DESC
      ) fe_ofc
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC1')
        ORDER BY swh.swh_fecha DESC
      ) fe_cc1
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC2')
        ORDER BY swh.swh_fecha DESC
      ) fe_cc2
      WHERE (@0 IS NULL OR s.sol_id = @0)
        AND (@1 IS NULL OR s.sol_numero_solicitud = @1)
    `;

    const rows = await this.dataSource.query(sql, [byId, byNumero]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];

    const fechaEnvio = r.fecha_envio as string | null;

    const rawAreas = [
      {
        area: 'EJECUTIVO',
        label: 'Ejecutivo de Negocios',
        est: r.est_ejecutivo,
        real: r.real_ejecutivo,
        sla: null,
      },
      {
        area: 'AUXILIAR_SC',
        label: 'Auxiliar Serv. Cliente',
        est: r.est_auxiliar_sc,
        real: r.real_auxiliar_sc,
        sla: null,
      },
      {
        area: 'OFICIAL_CUMPLIMIENTO',
        label: 'Oficial de Cumplimiento',
        est: r.est_oficial,
        real: r.real_oficial,
        sla: null,
      },
      {
        area: 'COMERCIAL',
        label: 'Área Comercial',
        est: r.est_comercial,
        real: r.real_comercial,
        sla: r.sla_comercial ? Number(r.sla_comercial) : 3,
      },
      {
        area: 'COMITE_1',
        label: 'Comité de Crédito 1',
        est: r.est_comite1,
        real: r.real_comite1,
        sla: null,
      },
      {
        area: 'COMITE_2',
        label: 'Comité de Crédito 2',
        est: r.est_comite2,
        real: r.real_comite2,
        sla: null,
      },
    ];

    const areas = rawAreas.map((a) => {
      // dias_meta: SLA configurado si existe, sino DATEDIFF(fecha_envio, fecha_estimada)
      const dias_meta: number | null =
        a.sla !== null
          ? a.sla
          : fechaEnvio && a.est
            ? this.diffDias(fechaEnvio, a.est)
            : null;

      // dias_reales: DATEDIFF(fecha_envio, fecha_real)
      const dias_reales: number | null =
        fechaEnvio && a.real ? this.diffDias(fechaEnvio, a.real) : null;

      return {
        area: a.area,
        label: a.label,
        fecha_estimada: a.est || null,
        fecha_real: a.real || null,
        dias_meta,
        dias_reales,
        procesada: !!a.real,
        vencida: a.real && a.est ? a.real > a.est : false,
      };
    });

    return {
      sol_id: Number(r.sol_id),
      numero_solicitud: r.sol_numero_solicitud || '',
      razon_social: r.razon_social || '',
      nit: r.nit || '',
      fecha_envio: fechaEnvio || '',
      centro_operacion: r.centro_operacion || '',
      estado: r.estado || '',
      areas,
    };
  }

  private diffDias(a: string, b: string): number {
    return Math.round(
      (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
    );
  }

  async getDetalleArea(query: {
    area: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    co_id?: string;
  }): Promise<SolicitudDetalle[]> {
    const AREAS: Record<
      string,
      { col_real: string; col_est: string; wet_codigo: string }
    > = {
      EJECUTIVO: {
        col_real: 'sol_fecha_real_ejecutivo',
        col_est: 'sol_fecha_estimada_ejecutivo',
        wet_codigo: 'EJN',
      },
      AUXILIAR_SC: {
        col_real: 'sol_fecha_real_auxiliar_servicio_cliente',
        col_est: 'sol_fecha_estimada_auxiliar_servicio_cliente',
        wet_codigo: 'ASC',
      },
      OFICIAL_CUMPLIMIENTO: {
        col_real: 'sol_fecha_real_oficial_cumplimiento',
        col_est: 'sol_fecha_estimada_oficial_cumplimiento',
        wet_codigo: 'OFC',
      },
      COMITE_1: {
        col_real: 'sol_fecha_real_comite_credito_1',
        col_est: 'sol_fecha_estimada_comite_credito_1',
        wet_codigo: 'CC1',
      },
      COMITE_2: {
        col_real: 'sol_fecha_real_comite_credito_2',
        col_est: 'sol_fecha_estimada_comite_credito_2',
        wet_codigo: 'CC2',
      },
    };

    const cols = AREAS[query.area.toUpperCase()];
    if (!cols) throw new Error(`Área desconocida: ${query.area}`);

    const fechaDesde = query.fecha_desde || null;
    const fechaHasta = query.fecha_hasta || null;
    const coId = query.co_id ? parseInt(query.co_id, 10) : null;

    const sql = `
      SELECT
        s.sol_id,
        s.sol_numero_solicitud,
        ISNULL(s.sol_razon_social, '') AS razon_social,
        CONVERT(varchar(10), s.sol_fecha_envio, 23) AS fecha_envio,
        CONVERT(varchar(10), COALESCE(fe.swh_fecha_estimada, s.${cols.col_est}), 23) AS fecha_estimada,
        CONVERT(varchar(10), s.${cols.col_real}, 23) AS fecha_real,
        DATEDIFF(day, s.sol_fecha_envio, s.${cols.col_real}) AS dias_reales,
        DATEDIFF(day, s.sol_fecha_envio, COALESCE(fe.swh_fecha_estimada, s.${cols.col_est})) AS dias_estimados,
        DATEDIFF(day, COALESCE(fe.swh_fecha_estimada, s.${cols.col_est}), s.${cols.col_real}) AS diferencia
      FROM solicitudes s
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada
        FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id
          AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = '${cols.wet_codigo}')
        ORDER BY swh.swh_fecha DESC
      ) fe
      WHERE s.${cols.col_real} IS NOT NULL
        AND (@0 IS NULL OR s.sol_fecha_envio >= @0)
        AND (@1 IS NULL OR s.sol_fecha_envio <= @1)
        AND (@2 IS NULL OR s.sol_co_id = @2)
      ORDER BY diferencia DESC
    `;

    const rows = await this.dataSource.query(sql, [
      fechaDesde,
      fechaHasta,
      coId,
    ]);
    return rows.map((r: any) => ({
      sol_id: Number(r.sol_id),
      numero_solicitud: r.sol_numero_solicitud || '',
      razon_social: r.razon_social || '',
      fecha_envio: r.fecha_envio || '',
      fecha_estimada: r.fecha_estimada || '',
      fecha_real: r.fecha_real || '',
      dias_reales: Number(r.dias_reales ?? 0),
      dias_estimados: Number(r.dias_estimados ?? 0),
      diferencia: Number(r.diferencia ?? 0),
      estado: Number(r.diferencia ?? 0) <= 0 ? 'a_tiempo' : 'vencida',
    }));
  }

  private async queryPorMes(coId: number | null): Promise<MesTendencia[]> {
    const sql = `
      SELECT
        FORMAT(sol_fecha_envio, 'yyyy-MM') AS mes,
        COUNT(*) AS total,
        SUM(CASE WHEN sol_estado_id = 3 THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN sol_estado_id = 4 THEN 1 ELSE 0 END) AS rechazadas
      FROM solicitudes
      WHERE sol_estado_id != 1
        AND sol_fecha_envio IS NOT NULL
        AND sol_fecha_envio >= DATEADD(month, -6, GETDATE())
        AND (@0 IS NULL OR sol_co_id = @0)
      GROUP BY FORMAT(sol_fecha_envio, 'yyyy-MM')
      ORDER BY mes
    `;
    const rows = await this.dataSource.query(sql, [coId]);
    return rows.map((r: any) => ({
      mes: r.mes,
      total: Number(r.total || 0),
      aprobadas: Number(r.aprobadas || 0),
      rechazadas: Number(r.rechazadas || 0),
    }));
  }
}
