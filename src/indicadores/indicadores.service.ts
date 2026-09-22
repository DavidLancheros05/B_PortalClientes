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

export interface SolicitudSlaListado {
  sol_id: number;
  numero_solicitud: string;
  razon_social: string;
  fecha_envio: string;
  estado: string;
  sla_general: {
    fecha_estimada: string | null;
    fecha_real: string | null;
    dias_meta: number | null;
    dias_reales: number | null;
    procesada: boolean;
    vencida: boolean;
  };
  pct_cumplimiento: number;
  en_riesgo: boolean;
}

@Injectable()
export class IndicadoresService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getCumplimiento(query: { fecha_desde?: string; fecha_hasta?: string }) {
    const fechaDesde = query.fecha_desde || null;
    const fechaHasta = query.fecha_hasta || null;

    const [resumen, porArea, porMes] = await Promise.all([
      this.queryResumen(fechaDesde, fechaHasta),
      this.queryPorArea(fechaDesde, fechaHasta),
      this.queryPorMes(),
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
  ) {
    const sql = `
      SELECT
        COUNT(*) AS total_solicitudes,
        SUM(CASE WHEN se.ses_codigo = 'APROBADA' THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN se.ses_codigo = 'RECHAZADA' THEN 1 ELSE 0 END) AS rechazadas,
        SUM(CASE WHEN se.ses_codigo IN ('PENDIENTE', 'REVISION') THEN 1 ELSE 0 END) AS pendientes
      FROM solicitudes s
      JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
      WHERE se.ses_codigo != 'BORRADOR'
        AND (@0 IS NULL OR s.sol_fecha_envio >= @0)
        AND (@1 IS NULL OR s.sol_fecha_envio <= @1)
    `;
    const rows = await this.dataSource.query(sql, [fechaDesde, fechaHasta]);
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
  ): Promise<AreaKPI[]> {
    const areas = [
      {
        area: 'EJECUTIVO',
        label: 'Ejecutivo de Negocios',
        col_real: 'sol_fecha_gest_ejn',
        col_est: 'sol_fecha_est_gest_ejn',
        wet_codigo: 'EJN',
      },
      {
        area: 'AUXILIAR_SC',
        label: 'Auxiliar Serv. Cliente',
        col_real: 'sol_fecha_gest_asc',
        col_est: 'sol_fecha_est_gest_asc',
        wet_codigo: 'ASC',
      },
      {
        area: 'OFICIAL_CUMPLIMIENTO',
        label: 'Oficial de Cumplimiento',
        col_real: 'sol_fecha_gest_oc',
        col_est: 'sol_fecha_est_gest_oc',
        wet_codigo: 'OFC',
      },
      {
        area: 'COMITE_1',
        label: 'Comité de Crédito 1',
        col_real: 'sol_fecha_gest_cc1',
        col_est: 'sol_fecha_est_gest_cc1',
        wet_codigo: 'CC1',
      },
      {
        area: 'COMITE_2',
        label: 'Comité de Crédito 2',
        col_real: 'sol_fecha_gest_cc2',
        col_est: 'sol_fecha_est_gest_cc2',
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
          SUM(CASE WHEN CAST(s.${a.col_real} AS date) <= CAST(COALESCE(fe.swh_fecha_estimada, s.${a.col_est}) AS date) THEN 1 ELSE 0 END) AS a_tiempo,
          SUM(CASE WHEN CAST(s.${a.col_real} AS date) > CAST(COALESCE(fe.swh_fecha_estimada, s.${a.col_est}) AS date) THEN 1 ELSE 0 END) AS vencidas,
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
      `;
      const rows = await this.dataSource.query(sql, [fechaDesde, fechaHasta]);
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
        s.sol_numero,
        ISNULL(c.cli_razon_social, '') AS razon_social,
        ISNULL(c.cli_nro_identificacion, '') AS nit,
        CONVERT(varchar(10), s.sol_fecha_envio, 23) AS fecha_envio,
        ISNULL(se.ses_codigo, '') AS estado,

        -- EJECUTIVO
        CONVERT(varchar(10), COALESCE(fe_ejn.swh_fecha_estimada, s.sol_fecha_est_gest_ejn), 23) AS est_ejecutivo,
        CONVERT(varchar(10), s.sol_fecha_gest_ejn, 23) AS real_ejecutivo,

        -- AUXILIAR SC
        CONVERT(varchar(10), COALESCE(fe_asc.swh_fecha_estimada, s.sol_fecha_est_gest_asc), 23) AS est_auxiliar_sc,
        CONVERT(varchar(10), s.sol_fecha_gest_asc, 23) AS real_auxiliar_sc,

        -- OFICIAL CUMPLIMIENTO
        CONVERT(varchar(10), COALESCE(fe_ofc.swh_fecha_estimada, s.sol_fecha_est_gest_oc), 23) AS est_oficial,
        CONVERT(varchar(10), s.sol_fecha_gest_oc, 23) AS real_oficial,

        -- COMITE 1
        CONVERT(varchar(10), COALESCE(fe_cc1.swh_fecha_estimada, s.sol_fecha_est_gest_cc1), 23) AS est_comite1,
        CONVERT(varchar(10), s.sol_fecha_gest_cc1, 23) AS real_comite1,

        -- COMITE 2
        CONVERT(varchar(10), COALESCE(fe_cc2.swh_fecha_estimada, s.sol_fecha_est_gest_cc2), 23) AS est_comite2,
        CONVERT(varchar(10), s.sol_fecha_gest_cc2, 23) AS real_comite2,

        -- SLA GENERAL (nivel empresa, el que se le comunica al cliente): la
        -- meta es la fecha estimada de la última etapa (CC2), encadenada
        -- desde el envío al crear la solicitud (ver solicitudes.service.ts).
        -- La fecha real es la de la etapa más avanzada que ya respondió,
        -- sea que la solicitud haya llegado hasta CC2 o se haya resuelto
        -- (aprobada/rechazada) antes.
        CONVERT(varchar(10), s.sol_fecha_est_gest_cc2, 23) AS meta_general,
        CONVERT(
          varchar(10),
          COALESCE(
            s.sol_fecha_gest_cc2,
            s.sol_fecha_gest_cc1,
            s.sol_fecha_gest_oc,
            s.sol_fecha_gest_asc,
            s.sol_fecha_gest_ejn
          ),
          23
        ) AS real_general

      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cli_id
      LEFT JOIN solicitud_estados se ON s.sol_ses_id = se.ses_id
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
        AND (@1 IS NULL OR s.sol_numero = @1)
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

    // SLA general: días meta = calendario entre envío y la meta encadenada
    // (ya trae los fines de semana/festivos absorbidos, igual que se hace
    // arriba para las áreas sin SLA fijo configurado).
    const metaGeneral = r.meta_general as string | null;
    const realGeneral = r.real_general as string | null;
    const diasMetaGeneral =
      fechaEnvio && metaGeneral ? this.diffDias(fechaEnvio, metaGeneral) : null;
    const diasRealesGeneral =
      fechaEnvio && realGeneral ? this.diffDias(fechaEnvio, realGeneral) : null;

    const slaGeneral = {
      fecha_estimada: metaGeneral || null,
      fecha_real: realGeneral || null,
      dias_meta: diasMetaGeneral,
      dias_reales: diasRealesGeneral,
      procesada: !!realGeneral,
      vencida: realGeneral && metaGeneral ? realGeneral > metaGeneral : false,
    };

    return {
      sol_id: Number(r.sol_id),
      numero_solicitud: r.sol_numero || '',
      razon_social: r.razon_social || '',
      nit: r.nit || '',
      fecha_envio: fechaEnvio || '',
      estado: r.estado || '',
      sla_general: slaGeneral,
      areas,
    };
  }

  private diffDias(a: string, b: string): number {
    return Math.round(
      (new Date(b).getTime() - new Date(a).getTime()) / 86400000,
    );
  }

  // % de cumplimiento del SLA general por solicitud: 100 si está a tiempo
  // (resuelta dentro del plazo, o en curso sin superar el plazo aún);
  // si se pasó del plazo, penalización lineal proporcional a los días de
  // atraso sobre los días de meta, con piso en 0. "En riesgo" marca las
  // solicitudes en curso (sin resolver) que ya consumieron el 80% del
  // plazo sin haberlo superado todavía.
  private calcularSlaListado(
    diasMeta: number | null,
    diasBase: number | null,
    procesada: boolean,
  ): { pctCumplimiento: number; vencida: boolean; enRiesgo: boolean } {
    if (diasMeta === null || diasMeta <= 0 || diasBase === null) {
      return { pctCumplimiento: 100, vencida: false, enRiesgo: false };
    }

    const diasAtraso = diasBase - diasMeta;
    const vencida = diasAtraso > 0;
    const pctCumplimiento = vencida
      ? Math.max(0, Math.round(100 - (diasAtraso / diasMeta) * 100))
      : 100;
    const enRiesgo = !vencida && !procesada && diasBase >= diasMeta * 0.8;

    return { pctCumplimiento, vencida, enRiesgo };
  }

  async getListadoSla(query: {
    numero?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    estado?: string;
    sla?: 'vencida' | 'en_riesgo' | 'a_tiempo';
  }): Promise<SolicitudSlaListado[]> {
    const numero = query.numero?.trim() || null;
    const fechaDesde = query.fecha_desde || null;
    const fechaHasta = query.fecha_hasta || null;
    const estado = query.estado?.trim() || null;

    const sql = `
      SELECT
        s.sol_id,
        s.sol_numero,
        ISNULL(c.cli_razon_social, '') AS razon_social,
        CONVERT(varchar(10), s.sol_fecha_envio, 23) AS fecha_envio,
        ISNULL(se.ses_codigo, '') AS estado,
        CONVERT(varchar(10), s.sol_fecha_est_gest_cc2, 23) AS meta_general,
        CONVERT(
          varchar(10),
          COALESCE(
            s.sol_fecha_gest_cc2,
            s.sol_fecha_gest_cc1,
            s.sol_fecha_gest_oc,
            s.sol_fecha_gest_asc,
            s.sol_fecha_gest_ejn
          ),
          23
        ) AS real_general
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cli_id
      LEFT JOIN solicitud_estados se ON s.sol_ses_id = se.ses_id
      WHERE s.sol_fecha_envio IS NOT NULL
        AND (@0 IS NULL OR s.sol_numero LIKE '%' + @0 + '%')
        AND (@1 IS NULL OR s.sol_fecha_envio >= @1)
        AND (@2 IS NULL OR s.sol_fecha_envio <= @2)
        AND (@3 IS NULL OR se.ses_codigo = @3)
      ORDER BY s.sol_fecha_envio DESC
    `;
    const rows = await this.dataSource.query(sql, [
      numero,
      fechaDesde,
      fechaHasta,
      estado,
    ]);

    const hoy = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const resultado: SolicitudSlaListado[] = rows.map((r: any) => {
      const fechaEnvio = r.fecha_envio as string | null;
      const metaGeneral = r.meta_general as string | null;
      const realGeneral = r.real_general as string | null;

      const diasMeta =
        fechaEnvio && metaGeneral
          ? this.diffDias(fechaEnvio, metaGeneral)
          : null;
      const diasReales =
        fechaEnvio && realGeneral
          ? this.diffDias(fechaEnvio, realGeneral)
          : null;
      const procesada = !!realGeneral;
      const diasBase = procesada
        ? diasReales
        : fechaEnvio
          ? this.diffDias(fechaEnvio, hoy)
          : null;

      const { pctCumplimiento, vencida, enRiesgo } = this.calcularSlaListado(
        diasMeta,
        diasBase,
        procesada,
      );

      return {
        sol_id: Number(r.sol_id),
        numero_solicitud: r.sol_numero || '',
        razon_social: r.razon_social || '',
        fecha_envio: fechaEnvio || '',
        estado: r.estado || '',
        sla_general: {
          fecha_estimada: metaGeneral || null,
          fecha_real: realGeneral || null,
          dias_meta: diasMeta,
          dias_reales: diasReales,
          procesada,
          vencida,
        },
        pct_cumplimiento: pctCumplimiento,
        en_riesgo: enRiesgo,
      };
    });

    if (!query.sla) return resultado;
    if (query.sla === 'vencida')
      return resultado.filter((r) => r.sla_general.vencida);
    if (query.sla === 'en_riesgo') return resultado.filter((r) => r.en_riesgo);
    if (query.sla === 'a_tiempo')
      return resultado.filter((r) => !r.sla_general.vencida && !r.en_riesgo);
    return resultado;
  }

  async getDetalleArea(query: {
    area: string;
    fecha_desde?: string;
    fecha_hasta?: string;
  }): Promise<SolicitudDetalle[]> {
    const AREAS: Record<
      string,
      { col_real: string; col_est: string; wet_codigo: string }
    > = {
      EJECUTIVO: {
        col_real: 'sol_fecha_gest_ejn',
        col_est: 'sol_fecha_est_gest_ejn',
        wet_codigo: 'EJN',
      },
      AUXILIAR_SC: {
        col_real: 'sol_fecha_gest_asc',
        col_est: 'sol_fecha_est_gest_asc',
        wet_codigo: 'ASC',
      },
      OFICIAL_CUMPLIMIENTO: {
        col_real: 'sol_fecha_gest_oc',
        col_est: 'sol_fecha_est_gest_oc',
        wet_codigo: 'OFC',
      },
      COMITE_1: {
        col_real: 'sol_fecha_gest_cc1',
        col_est: 'sol_fecha_est_gest_cc1',
        wet_codigo: 'CC1',
      },
      COMITE_2: {
        col_real: 'sol_fecha_gest_cc2',
        col_est: 'sol_fecha_est_gest_cc2',
        wet_codigo: 'CC2',
      },
    };

    const cols = AREAS[query.area.toUpperCase()];
    if (!cols) throw new Error(`Área desconocida: ${query.area}`);

    const fechaDesde = query.fecha_desde || null;
    const fechaHasta = query.fecha_hasta || null;

    const sql = `
      SELECT
        s.sol_id,
        s.sol_numero,
        ISNULL(c.cli_razon_social, '') AS razon_social,
        CONVERT(varchar(10), s.sol_fecha_envio, 23) AS fecha_envio,
        CONVERT(varchar(10), COALESCE(fe.swh_fecha_estimada, s.${cols.col_est}), 23) AS fecha_estimada,
        CONVERT(varchar(10), s.${cols.col_real}, 23) AS fecha_real,
        DATEDIFF(day, s.sol_fecha_envio, s.${cols.col_real}) AS dias_reales,
        DATEDIFF(day, s.sol_fecha_envio, COALESCE(fe.swh_fecha_estimada, s.${cols.col_est})) AS dias_estimados,
        DATEDIFF(day, COALESCE(fe.swh_fecha_estimada, s.${cols.col_est}), s.${cols.col_real}) AS diferencia
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cli_id
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
      ORDER BY diferencia DESC
    `;

    const rows = await this.dataSource.query(sql, [fechaDesde, fechaHasta]);
    return rows.map((r: any) => ({
      sol_id: Number(r.sol_id),
      numero_solicitud: r.sol_numero || '',
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

  private async queryPorMes(): Promise<MesTendencia[]> {
    const sql = `
      SELECT
        FORMAT(s.sol_fecha_envio, 'yyyy-MM') AS mes,
        COUNT(*) AS total,
        SUM(CASE WHEN se.ses_codigo = 'APROBADA' THEN 1 ELSE 0 END) AS aprobadas,
        SUM(CASE WHEN se.ses_codigo = 'RECHAZADA' THEN 1 ELSE 0 END) AS rechazadas
      FROM solicitudes s
      JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
      WHERE se.ses_codigo != 'BORRADOR'
        AND s.sol_fecha_envio IS NOT NULL
        AND s.sol_fecha_envio >= DATEADD(month, -6, GETDATE())
      GROUP BY FORMAT(s.sol_fecha_envio, 'yyyy-MM')
      ORDER BY mes
    `;
    const rows = await this.dataSource.query(sql);
    return rows.map((r: any) => ({
      mes: r.mes,
      total: Number(r.total || 0),
      aprobadas: Number(r.aprobadas || 0),
      rechazadas: Number(r.rechazadas || 0),
    }));
  }
}
