import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SolicitudListadoGestionDto } from './dto/solicitud-listado-gestion.response.dto';
import { SolicitudClienteDto } from './dto/solicitud-cliente.response.dto';
import { SolicitudPendienteDto } from './dto/solicitud-pendiente.response.dto';

@Injectable()
export class SolicitudesListadosService {
  constructor(private readonly dataSource: DataSource) {}

  private async resolveLookupColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('clientes','cli_id') IS NOT NULL THEN 'cli_id' ELSE 'cliente_id' END AS cli_id,
        CASE WHEN COL_LENGTH('clientes','cli_razon_social') IS NOT NULL THEN 'cli_razon_social' ELSE 'cliente_razon_social' END AS cli_razon_social,
        CASE WHEN COL_LENGTH('clientes','cli_ejecutivo_id') IS NOT NULL THEN 'cli_ejecutivo_id' ELSE 'ejecutivo_id' END AS cli_ejecutivo_id,
        CASE WHEN COL_LENGTH('Centro_operacion','cop_id') IS NOT NULL THEN 'cop_id' ELSE 'cop_id' END AS co_id,
        CASE WHEN COL_LENGTH('Centro_operacion','cop_nombre') IS NOT NULL THEN 'cop_nombre' ELSE 'cop_nombre' END AS co_nombre,
        CASE WHEN COL_LENGTH('usuarios','usr_id') IS NOT NULL THEN 'usr_id' ELSE 'usr_id' END AS usr_id,
        CASE WHEN COL_LENGTH('usuarios','usr_nombre') IS NOT NULL THEN 'usr_nombre' ELSE 'nombre' END AS usr_nombre
    `);
    const row = result[0] ?? {};
    return {
      cliId: String(row.cli_id ?? 'cliente_id').trim(),
      cliRazonSocial: String(
        row.cli_razon_social ?? 'cliente_razon_social',
      ).trim(),
      cliEjecutivoId: String(row.cli_ejecutivo_id ?? 'ejecutivo_id').trim(),
      coId: String(row.co_id ?? 'co_id').trim(),
      coNombre: String(row.co_nombre ?? 'co_nombre').trim(),
      usrId: String(row.usr_id ?? 'usr_id').trim(),
      usrNombre: String(row.usr_nombre ?? 'nombre').trim(),
    };
  }

  // ===== LISTADO: Query methods =====

  async getListado(query: {
    mode?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    co_id?: string;
    ejecutivo_id?: string;
    cliente_id?: string;
    estado_id?: string;
    etapa_id?: string;
    resultado_etapa_id?: string;
  }): Promise<SolicitudListadoGestionDto[]> {
    const columns = await this.resolveLookupColumns();

    if ((query.mode || '').trim().toLowerCase() === 'ejecutivos') {
      return await this.dataSource.query(`
        SELECT DISTINCT
          s.sol_ejecutivo_id,
          u.${columns.usrNombre} AS ejecutivo_nombre
        FROM solicitudes s
        INNER JOIN usuarios u ON u.${columns.usrId} = s.sol_ejecutivo_id
        WHERE s.sol_ejecutivo_id IS NOT NULL
        ORDER BY u.${columns.usrNombre}
      `);
    }

    const whereClauses: string[] = [];
    const params: any[] = [];
    let idx = 0;

    const fechaDesde = (query.fecha_desde || '').trim();
    const fechaHasta = (query.fecha_hasta || '').trim();
    const centroOperacionId = Number(query.co_id || 0);
    const ejecutivoId = Number(query.ejecutivo_id || 0);
    const clienteId = Number(query.cliente_id || 0);
    const estadoId = Number(query.estado_id || 0);
    const etapaId = Number(query.etapa_id || 0);
    const resultadoId = Number(query.resultado_etapa_id || 0);

    if (fechaDesde) {
      whereClauses.push(`CAST(s.sol_fecha_creacion AS DATE) >= @${idx++}`);
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      whereClauses.push(`CAST(s.sol_fecha_creacion AS DATE) <= @${idx++}`);
      params.push(fechaHasta);
    }
    if (Number.isInteger(centroOperacionId) && centroOperacionId > 0) {
      whereClauses.push(`s.sol_co_id = @${idx++}`);
      params.push(centroOperacionId);
    }
    if (Number.isInteger(ejecutivoId) && ejecutivoId > 0) {
      whereClauses.push(`s.sol_ejecutivo_id = @${idx++}`);
      params.push(ejecutivoId);
    }
    if (Number.isInteger(clienteId) && clienteId > 0) {
      whereClauses.push(`s.sol_cliente_id = @${idx++}`);
      params.push(clienteId);
    }
    if (Number.isInteger(estadoId) && estadoId > 0) {
      whereClauses.push(`s.sol_estado_id = @${idx++}`);
      params.push(estadoId);
    }
    if (Number.isInteger(etapaId) && etapaId > 0) {
      whereClauses.push(`s.sol_etapa_actual_id = @${idx++}`);
      params.push(etapaId);
    }
    if (Number.isInteger(resultadoId) && resultadoId > 0) {
      whereClauses.push(`s.sol_resultado_etapa_id = @${idx++}`);
      params.push(resultadoId);
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT
        s.sol_id AS [sol_id],
        s.sol_numero_solicitud AS [sol_numero_solicitud],
        s.sol_cliente_id AS [sol_cliente_id],
        c.${columns.cliRazonSocial} AS [cliente_nombre],
        s.sol_ejecutivo_id AS [sol_ejecutivo_id],
        COALESCE(e.ejng_nombre, u.${columns.usrNombre}) AS [ejecutivo_nombre],
        co_exec.${columns.coNombre} AS [ejecutivo_area],
        NULL AS [auxiliar_id],
        NULL AS [auxiliar_nombre],
        NULL AS [auxiliar_area],
        s.sol_co_id AS [sol_co_id],
        co.${columns.coNombre} AS [centro_operacion_nombre],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_estado_id AS [sol_estado_id],
        s.sol_etapa_actual_id AS [sol_etapa_actual_id],
        we.wet_nombre AS [etapa_nombre],
        s.sol_resultado_etapa_id AS [sol_resultado_etapa_id],
        wr.wee_nombre AS [resultado_nombre],
        s.sol_formulario_version AS [sol_formulario_version],
        s.sol_fecha_estimada_respuesta_comercial AS [sol_fecha_estimada_respuesta_comercial],
        s.sol_fecha_real_respuesta_comercial AS [sol_fecha_real_respuesta_comercial],
        s.sol_fecha_estimada_respuesta_financiera AS [sol_fecha_estimada_respuesta_financiera],
        s.sol_fecha_real_respuesta_financiera AS [sol_fecha_real_respuesta_financiera],
        s.sol_fecha_estimada_oficial_cumplimiento AS [sol_fecha_estimada_oficial_cumplimiento],
        s.sol_fecha_real_oficial_cumplimiento AS [sol_fecha_real_oficial_cumplimiento],
        s.sol_fecha_estimada_ejecutivo AS [sol_fecha_estimada_ejecutivo],
        s.sol_fecha_real_ejecutivo AS [sol_fecha_real_ejecutivo],
        s.sol_fecha_estimada_auxiliar_servicio_cliente AS [sol_fecha_estimada_auxiliar_servicio_cliente],
        s.sol_fecha_real_auxiliar_servicio_cliente AS [sol_fecha_real_auxiliar_servicio_cliente],
        s.sol_fecha_estimada_comite_credito_1 AS [sol_fecha_estimada_comite_credito_1],
        s.sol_fecha_real_comite_credito_1 AS [sol_fecha_real_comite_credito_1],
        s.sol_fecha_estimada_comite_credito_2 AS [sol_fecha_estimada_comite_credito_2],
        s.sol_fecha_real_comite_credito_2 AS [sol_fecha_real_comite_credito_2],
        s.sol_fecha_estimada_comite_credito_1_ejecutivo AS [sol_fecha_estimada_comite_credito_1_ejecutivo],
        s.sol_fecha_real_comite_credito_1_ejecutivo AS [sol_fecha_real_comite_credito_1_ejecutivo],
        s.sol_fecha_estimada_comite_credito_2_ejecutivo AS [sol_fecha_estimada_comite_credito_2_ejecutivo],
        s.sol_fecha_real_comite_credito_2_ejecutivo AS [sol_fecha_real_comite_credito_2_ejecutivo],
        s.sol_fecha_estimada_comite_credito_1_auxiliar AS [sol_fecha_estimada_comite_credito_1_auxiliar],
        s.sol_fecha_real_comite_credito_1_auxiliar AS [sol_fecha_real_comite_credito_1_auxiliar],
        s.sol_fecha_estimada_comite_credito_2_auxiliar AS [sol_fecha_estimada_comite_credito_2_auxiliar],
        s.sol_fecha_real_comite_credito_2_auxiliar AS [sol_fecha_real_comite_credito_2_auxiliar],
        s.sol_cupo_aprobado AS [sol_cupo_aprobado],
        s.sol_plazo_pago AS [sol_plazo_pago],
        s.sol_forma_pago AS [sol_forma_pago]
      FROM solicitudes s
      LEFT JOIN clientes c ON c.${columns.cliId} = s.sol_cliente_id
      LEFT JOIN Ejecutivo_negocio e ON e.ejng_id = s.sol_ejecutivo_id
      LEFT JOIN Centro_operacion co_exec ON co_exec.${columns.coId} = e.cop_id
      LEFT JOIN usuarios u ON u.${columns.usrId} = s.sol_ejecutivo_id
      LEFT JOIN Centro_operacion co ON co.${columns.coId} = s.sol_co_id
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_etapa_actual_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_resultado_etapa_id
      ${whereSql}
      ORDER BY s.sol_fecha_creacion DESC
    `.replace(/\?/g, (_) => {
      const param = params.shift();
      return typeof param === 'string' ? `'${param}'` : param;
    });

    const results = await this.dataSource.query(sql, params);
    return results;
  }

  async obtenerSolicitudesPorCliente(
    clienteId: number,
    filters?: { searchTerm?: string; estado?: string },
  ): Promise<SolicitudClienteDto[]> {
    let sql = `
    SELECT
      s.sol_id AS [sol_id],
      s.sol_numero_solicitud AS [sol_numero_solicitud],
      s.sol_estado_id AS [sol_estado_id],
      s.sol_etapa_actual_id AS [sol_etapa_actual_id],
      s.sol_resultado_etapa_id AS [sol_resultado_etapa_id],
      s.sol_cliente_id AS [sol_cliente_id],
      s.sol_co_id AS [sol_co_id],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_created_at AS [sol_created_at],
      s.sol_updated_at AS [sol_updated_at],
      s.sol_consumo_mensual_proyectado AS [sol_consumo_mensual_proyectado],
      s.sol_es_zona_franca AS [sol_es_zona_franca],
      s.sol_version AS [sol_version],
      s.sol_formulario_version AS [sol_formulario_version],
      s.sol_cupo_aprobado AS [sol_cupo_aprobado],
      s.sol_plazo_pago AS [sol_plazo_pago],
      s.sol_forma_pago AS [sol_forma_pago],
      s.sol_usuario_aprueba_condiciones AS [sol_usuario_aprueba_condiciones],
      c.cli_razon_social AS [cliente_nombre],
      c.cli_nro_identificacion AS [cliente_nit],
      co.cop_nombre AS [centro_operacion_nombre]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cliente_id = c.cli_id
    LEFT JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
    WHERE s.sol_cliente_id = @0
    `;

    const params: any[] = [clienteId];

    if (filters?.searchTerm) {
      sql += ` AND (
        s.sol_numero_solicitud LIKE @1
        OR c.cli_razon_social LIKE @1
        OR co.cop_nombre LIKE @1
      )`;
      params.push(`%${filters.searchTerm}%`);
    }

    if (filters?.estado && filters.estado !== 'todos') {
      const paramIndex = params.length;
      sql += ` AND s.sol_estado_id = @${paramIndex}`;
      params.push(Number(filters.estado));
    }

    sql += ` ORDER BY s.sol_fecha_creacion DESC`;

    return await this.dataSource.query(sql, params);
  }

  async getSolicitudesPendientes(): Promise<SolicitudPendienteDto[]> {
    const sql = `
    SELECT
      s.sol_id AS [sol_id],
      s.sol_numero_solicitud AS [sol_numero_solicitud],
      s.sol_cliente_id AS [sol_cliente_id],
      c.cli_razon_social AS [cliente_nombre],
      s.sol_co_id AS [sol_co_id],
      co.cop_nombre AS [centro_operacion_nombre],
      s.sol_estado_id AS [sol_estado_id],
      e.descripcion AS [estado_descripcion],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_etapa_actual_id AS [sol_etapa_actual_id],
      s.sol_resultado_etapa_id AS [sol_resultado_etapa_id]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cliente_id = c.cli_id
    LEFT JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
    LEFT JOIN solicitud_estados e ON e.est_id = s.sol_estado_id
    WHERE s.sol_estado_id = 2
    ORDER BY s.sol_fecha_creacion DESC
  `;
    return await this.dataSource.query(sql);
  }

  async getSolicitudesPendientesPorEjecutivoId(usuarioId: number) {
    if (!usuarioId) {
      throw new Error('No se proporcionó usuario ID');
    }

    const usuarioResult = await this.dataSource.query(
      `SELECT usr_id, ejng_id FROM usuarios WHERE usr_id = @0`,
      [usuarioId],
    );

    if (!usuarioResult || usuarioResult.length === 0) {
      throw new Error(`Usuario ${usuarioId} no encontrado`);
    }

    const ejecutivoId = usuarioResult[0].ejng_id;

    if (!ejecutivoId) {
      return [];
    }

    const columns = await this.resolveLookupColumns();

    const sql = `
    SELECT
      s.sol_id AS [sol_id],
      s.sol_numero_solicitud AS [sol_numero_solicitud],
      s.sol_estado_id AS [sol_estado_id],
      s.sol_cliente_id AS [sol_cliente_id],
      s.sol_co_id AS [sol_co_id],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_fecha_estimada_ejecutivo AS [sol_fecha_estimada_ejecutivo],
      s.sol_created_at AS [sol_created_at],
      s.sol_updated_at AS [sol_updated_at],
      s.sol_razon_social AS [sol_razon_social],
      s.sol_nit_documento AS [sol_nit_documento],
      s.sol_direccion AS [sol_direccion],
      s.sol_telefono AS [sol_telefono],
      s.sol_consumo_mensual_proyectado AS [sol_consumo_mensual_proyectado],
      s.sol_es_zona_franca AS [sol_es_zona_franca],
      s.sol_version AS [sol_version],
      s.sol_formulario_version AS [sol_formulario_version],
      c.${columns.cliRazonSocial} AS [cliente_nombre],
      c.cli_nro_identificacion AS [cliente_nit],
      co.cop_nombre AS [centro_operacion_nombre]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cliente_id = c.${columns.cliId}
    LEFT JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
    WHERE s.sol_ejecutivo_id = @0
      AND s.sol_estado_id = 2
    ORDER BY s.sol_fecha_creacion DESC
  `;

    return await this.dataSource.query(sql, [ejecutivoId]);
  }

  async getSolicitudesPorCentro(
    coId: number,
    estadoId?: number,
    estadoIds?: number[],
  ) {
    const columns = await this.resolveLookupColumns();

    let estadoFiltroSql = '';
    const params: any[] = [coId];

    if (estadoIds && estadoIds.length > 0) {
      const placeholders = estadoIds.map((_, idx) => `@${idx + 1}`).join(',');
      estadoFiltroSql = ` AND s.sol_estado_id IN (${placeholders})`;
      estadoIds.forEach((id, idx) => params.push(id));
    } else if (estadoId) {
      estadoFiltroSql = ` AND s.sol_estado_id = @${params.length}`;
      params.push(estadoId);
    }

    const sql = `
      SELECT
        s.sol_id AS [sol_id],
        s.sol_numero_solicitud AS [sol_numero_solicitud],
        s.sol_cliente_id AS [sol_cliente_id],
        c.${columns.cliRazonSocial} AS [cliente_nombre],
        s.sol_co_id AS [sol_co_id],
        co.${columns.coNombre} AS [centro_operacion_nombre],
        s.sol_estado_id AS [sol_estado_id],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_updated_at AS [sol_updated_at],
        s.sol_fecha_estimada_respuesta_comercial AS [sol_fecha_estimada_respuesta_comercial],
        s.sol_fecha_real_respuesta_comercial AS [sol_fecha_real_respuesta_comercial],
        s.sol_motivo_rechazo_id AS [sol_motivo_rechazo_id],
        mr.descripcion AS [motivo_rechazo],
        COALESCE(s.sol_consumo_mensual_proyectado, sce.sce_consumo_mensual) AS [consumo_mensual_proyectado],
        sce.sce_observaciones AS [observaciones_comercial]
      FROM solicitudes s
      LEFT JOIN clientes c ON s.sol_cliente_id = c.${columns.cliId}
      LEFT JOIN Centro_operacion co ON s.sol_co_id = co.${columns.coId}
      LEFT JOIN motivos_rechazo_solicitud mr ON s.sol_motivo_rechazo_id = mr.motivo_rechazo_id
      OUTER APPLY (
        SELECT TOP 1
          sce_consumo_mensual,
          sce_observaciones
        FROM solicitud_concepto_ejecutivo
        WHERE sce_solicitud_id = s.sol_id
        ORDER BY sce_fecha DESC
      ) sce
      WHERE s.sol_co_id = @0${estadoFiltroSql}
      ORDER BY s.sol_fecha_creacion DESC
    `;

    return await this.dataSource.query(sql, params);
  }

  async getSolicitudesPorEjecutivo(ejecutivoId: number) {
    const columns = await this.resolveLookupColumns();

    const sql = `
      WITH centros_usuario AS (
        SELECT uco_co_id AS co_id
        FROM usuarios_Centro_operacion
        WHERE uco_usr_id = @0
      )
      SELECT
        s.sol_id AS [sol_id],
        s.sol_numero_solicitud AS [sol_numero_solicitud],
        s.sol_cliente_id AS [sol_cliente_id],
        c.${columns.cliRazonSocial} AS [cliente_nombre],
        s.sol_co_id AS [sol_co_id],
        co.${columns.coNombre} AS [centro_operacion_nombre],
        s.sol_estado_id AS [sol_estado_id],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_estimada_respuesta_comercial AS [sol_fecha_estimada_respuesta_comercial],
        COALESCE(s.sol_consumo_mensual_proyectado, sce.sce_consumo_mensual) AS [consumo_mensual_proyectado],
        sce.sce_observaciones AS [observaciones_comercial],
        s.sol_ejecutivo_id AS [sol_ejecutivo_id],
        u.${columns.usrNombre} AS [ejecutivo_nombre]
      FROM solicitudes s
      LEFT JOIN clientes c ON s.sol_cliente_id = c.${columns.cliId}
      LEFT JOIN Centro_operacion co ON s.sol_co_id = co.${columns.coId}
      LEFT JOIN usuarios u ON s.sol_ejecutivo_id = u.${columns.usrId}
      OUTER APPLY (
        SELECT TOP 1
          sce_consumo_mensual,
          sce_observaciones
        FROM solicitud_concepto_ejecutivo
        WHERE sce_solicitud_id = s.sol_id
        ORDER BY sce_fecha DESC
      ) sce
      WHERE s.sol_estado_id = 2
        AND (
          NOT EXISTS (SELECT 1 FROM centros_usuario)
          OR s.sol_co_id IN (SELECT co_id FROM centros_usuario)
        )
      ORDER BY s.sol_fecha_creacion DESC
    `;

    return await this.dataSource.query(sql, [ejecutivoId]);
  }

  async getSolicitudesConFiltros(
    usuarioId: number,
    filtros?: {
      etapa_id?: number;
      resultado_etapa_id?: number;
      estado_id?: number;
    },
  ) {
    const columns = await this.resolveLookupColumns();
    const whereClauses: string[] = [];

    if (filtros?.etapa_id !== undefined) {
      whereClauses.push(`s.sol_etapa_actual_id = ${filtros.etapa_id}`);
    }

    if (filtros?.resultado_etapa_id !== undefined) {
      whereClauses.push(
        `s.sol_resultado_etapa_id = ${filtros.resultado_etapa_id}`,
      );
    }

    if (filtros?.estado_id !== undefined) {
      whereClauses.push(`s.sol_estado_id = ${filtros.estado_id}`);
    }

    if (whereClauses.length === 0) {
      whereClauses.push('1 = 0');
    }

    const whereClause = whereClauses.join(' AND ');
    const sql = this.buildSolicitudesQuery(columns, whereClause);
    return await this.dataSource.query(sql);
  }

  // ===== ÚLTIMAS SOLICITUDES POR CLIENTE =====

  async listarSolicitudes(limit: number = 50) {
    const sql = `
      SELECT TOP (@0)
        sol_id AS [sol_id],
        sol_numero_solicitud AS [sol_numero_solicitud],
        sol_cliente_id AS [sol_cliente_id],
        sol_estado_id AS [sol_estado_id],
        sol_fecha_creacion AS [sol_fecha_creacion],
        sol_es_zona_franca AS [sol_es_zona_franca]
      FROM solicitudes
      ORDER BY sol_fecha_creacion DESC
    `;
    return await this.dataSource.query(sql, [limit]);
  }

  async obtenerUltimaSolicitud(clienteId: number) {
    const sql = `
      SELECT TOP 1
        s.sol_id AS [sol_id],
        s.sol_numero_solicitud AS [sol_numero_solicitud],
        s.sol_estado_id AS [sol_estado_id],
        s.sol_etapa_actual_id AS [sol_etapa_actual_id],
        s.sol_resultado_etapa_id AS [sol_resultado_etapa_id],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_envio AS [sol_fecha_envio],
        c.cli_razon_social AS [cliente_nombre],
        c.cli_nro_identificacion AS [cliente_nit]
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id
      WHERE s.sol_cliente_id = @0
      ORDER BY s.sol_fecha_creacion DESC
    `;
    const result = await this.dataSource.query(sql, [clienteId]);
    return result[0] || null;
  }

  async obtenerUltimaSolicitudPendiente(clienteId: number) {
    const sql = `
      SELECT TOP 1
        sol_id AS [sol_id],
        sol_numero_solicitud AS [sol_numero_solicitud]
      FROM solicitudes
      WHERE sol_cliente_id = @0 AND sol_estado_id = 2
      ORDER BY sol_id DESC
    `;
    const result = await this.dataSource.query(sql, [clienteId]);
    return result[0] || null;
  }

  async obtenerUltimaSolicitudCompletada(clienteId: number) {
    const sql = `
      SELECT TOP 1
        sol_id AS [sol_id],
        sol_numero_solicitud AS [sol_numero_solicitud]
      FROM solicitudes
      WHERE sol_cliente_id = @0 AND sol_estado_id NOT IN (1, 2, 3)
      ORDER BY sol_fecha_creacion DESC
    `;
    const result = await this.dataSource.query(sql, [clienteId]);
    return result[0] || null;
  }

  // ===== POR ETAPA DE WORKFLOW =====

  async getSolicitudesPendientesAuxiliarServicioCliente(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_etapa_actual_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'ASC')
       AND s.sol_resultado_etapa_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  async getSolicitudesParaOC(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_etapa_actual_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'OFC')
       AND s.sol_resultado_etapa_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  async getSolicitudesParaComiteCredito1(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_etapa_actual_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC1')
       AND s.sol_resultado_etapa_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  async getSolicitudesParaComiteCredito2(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_etapa_actual_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC2')
       AND s.sol_resultado_etapa_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  private buildSolicitudesQuery(columns: any, whereClause: string): string {
    return `
      SELECT
        s.sol_id AS [sol_id],
        s.sol_numero_solicitud AS [sol_numero_solicitud],
        s.sol_cliente_id AS [sol_cliente_id],
        c.${columns.cliRazonSocial} AS [cliente_nombre],
        s.sol_co_id AS [sol_co_id],
        co.${columns.coNombre} AS [centro_operacion_nombre],
        s.sol_estado_id AS [sol_estado_id],
        s.sol_etapa_actual_id AS [sol_etapa_actual_id],
        s.sol_resultado_etapa_id AS [sol_resultado_etapa_id],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_estimada_respuesta_comercial AS [sol_fecha_estimada_respuesta_comercial],
        s.sol_fecha_real_respuesta_comercial AS [sol_fecha_real_respuesta_comercial],
        s.sol_fecha_estimada_auxiliar_servicio_cliente AS [sol_fecha_estimada_auxiliar_servicio_cliente],
        s.sol_fecha_estimada_oficial_cumplimiento AS [sol_fecha_estimada_oficial_cumplimiento],
        s.sol_fecha_estimada_comite_credito_1 AS [sol_fecha_estimada_comite_credito_1],
        s.sol_fecha_estimada_comite_credito_2 AS [sol_fecha_estimada_comite_credito_2],
        s.sol_consumo_mensual_proyectado AS [consumo_mensual_proyectado],
        s.sol_observacion_ejn AS [observacionesComercial],
        we.wet_nombre AS [etapa_nombre],
        wr.wee_nombre AS [resultado_nombre],
        s.sol_ejecutivo_id AS [sol_ejecutivo_id],
        u.${columns.usrNombre} AS [ejecutivo_nombre]
      FROM solicitudes s
      LEFT JOIN clientes c ON s.sol_cliente_id = c.${columns.cliId}
      LEFT JOIN Centro_operacion co ON s.sol_co_id = co.${columns.coId}
      LEFT JOIN usuarios u ON s.sol_ejecutivo_id = u.${columns.usrId}
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_etapa_actual_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_resultado_etapa_id
      WHERE ${whereClause}
      ORDER BY s.sol_fecha_creacion DESC
    `;
  }
}
