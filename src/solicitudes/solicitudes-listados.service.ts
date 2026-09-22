import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SolicitudListadoGestionDto } from './dto/solicitud-listado-gestion.response.dto';
import { SolicitudClienteDto } from './dto/solicitud-cliente.response.dto';
import { SolicitudPendienteDto } from './dto/solicitud-pendiente.response.dto';

@Injectable()
export class SolicitudesListadosService {
  constructor(private readonly dataSource: DataSource) {}

  // "Es Ampliación de Cupo" se lee de la respuesta a la pregunta
  // TIPO_SOLICITUD (Formulario_respuesta) — misma fuente para los dos
  // caminos que existen (ver documentacion/Portal Clientes/Solicitudes/
  // flujo-ampliacion-de-cupo.md): Camino 1 (cliente) la responde llenando
  // el formulario normal; Camino 2 (Ejecutivo, página dedicada que no pasa
  // por el formulario) hace que el backend la simule automáticamente al
  // guardar (AmpliacionCupoService.guardarRespuestasFormularioAmpliacion),
  // para que la solicitud no quede "vacía por dentro". sol_cupo_solicitado
  // se deja como respaldo (esa columna sí es exclusiva de Camino 2) para
  // el caso borde en que esa simulación falle — el propio flujo la trata
  // como la fuente de verdad de último recurso si el insert de la
  // respuesta no se completa. Búsqueda por fp_codigo, no fp_id fijo, para
  // sobrevivir a un cambio de versión del formulario.
  private static readonly ES_AMPLIACION_CUPO_SQL = `(
    EXISTS (
      SELECT 1
      FROM Formulario_respuesta fr
      INNER JOIN Formulario_pregunta fp2 ON fp2.fp_id = fr.fr_fp_id
      INNER JOIN Formulario_pregunta_opcion fpo ON fpo.fpo_id = fr.fr_valor_opcion_id
      WHERE fr.fr_sol_id = s.sol_id
        AND fp2.fp_codigo = 'TIPO_SOLICITUD'
        AND fpo.fpo_valor LIKE N'%mpliaci%'
    )
    OR s.sol_cupo_solicitado IS NOT NULL
  )`;

  private async resolveLookupColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('clientes','cli_id') IS NOT NULL THEN 'cli_id' ELSE 'cliente_id' END AS cli_id,
        CASE WHEN COL_LENGTH('clientes','cli_razon_social') IS NOT NULL THEN 'cli_razon_social' ELSE 'cliente_razon_social' END AS cli_razon_social,
        CASE WHEN COL_LENGTH('clientes','cli_ejecutivo_id') IS NOT NULL THEN 'cli_ejecutivo_id' ELSE 'ejecutivo_id' END AS cli_ejecutivo_id,
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
      usrId: String(row.usr_id ?? 'usr_id').trim(),
      usrNombre: String(row.usr_nombre ?? 'nombre').trim(),
    };
  }

  // ===== LISTADO: Query methods =====

  async getListado(query: {
    mode?: string;
    fecha_desde?: string;
    fecha_hasta?: string;
    ejecutivo_id?: string;
    cliente_id?: string;
    estado_id?: string;
    etapa_id?: string;
    resultado_etapa_id?: string;
    tipo_solicitud?: string;
  }): Promise<SolicitudListadoGestionDto[]> {
    const columns = await this.resolveLookupColumns();

    if ((query.mode || '').trim().toLowerCase() === 'ejecutivos') {
      return await this.dataSource.query(`
        SELECT DISTINCT
          s.sol_ejng_id,
          u.${columns.usrNombre} AS ejecutivo_nombre
        FROM solicitudes s
        INNER JOIN usuarios u ON u.${columns.usrId} = s.sol_ejng_id
        WHERE s.sol_ejng_id IS NOT NULL
        ORDER BY u.${columns.usrNombre}
      `);
    }

    const whereClauses: string[] = [];
    const params: any[] = [];
    let idx = 0;

    const fechaDesde = (query.fecha_desde || '').trim();
    const fechaHasta = (query.fecha_hasta || '').trim();
    const ejecutivoId = Number(query.ejecutivo_id || 0);
    const clienteId = Number(query.cliente_id || 0);
    const estadoId = Number(query.estado_id || 0);
    const etapaId = Number(query.etapa_id || 0);
    const resultadoId = Number(query.resultado_etapa_id || 0);

    if (fechaDesde) {
      whereClauses.push(`CAST(s.sol_fecha_envio AS DATE) >= @${idx++}`);
      params.push(fechaDesde);
    }
    if (fechaHasta) {
      whereClauses.push(`CAST(s.sol_fecha_envio AS DATE) <= @${idx++}`);
      params.push(fechaHasta);
    }
    if (Number.isInteger(ejecutivoId) && ejecutivoId > 0) {
      whereClauses.push(`s.sol_ejng_id = @${idx++}`);
      params.push(ejecutivoId);
    }
    if (Number.isInteger(clienteId) && clienteId > 0) {
      whereClauses.push(`s.sol_cli_id = @${idx++}`);
      params.push(clienteId);
    }
    if (Number.isInteger(estadoId) && estadoId > 0) {
      whereClauses.push(`s.sol_ses_id = @${idx++}`);
      params.push(estadoId);
    }
    if (Number.isInteger(etapaId) && etapaId > 0) {
      whereClauses.push(`s.sol_wet_id = @${idx++}`);
      params.push(etapaId);
    }
    if (Number.isInteger(resultadoId) && resultadoId > 0) {
      whereClauses.push(`s.sol_wee_id = @${idx++}`);
      params.push(resultadoId);
    }

    const tipoSolicitud = (query.tipo_solicitud || '').trim().toUpperCase();
    if (tipoSolicitud === 'AMPLIACION') {
      whereClauses.push(SolicitudesListadosService.ES_AMPLIACION_CUPO_SQL);
    } else if (tipoSolicitud === 'NUEVO') {
      whereClauses.push(
        `NOT ${SolicitudesListadosService.ES_AMPLIACION_CUPO_SQL}`,
      );
    }

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sql = `
      SELECT
        s.sol_id AS [sol_id],
        s.sol_numero AS [sol_numero],
        s.sol_cli_id AS [sol_cli_id],
        c.${columns.cliRazonSocial} AS [cliente_nombre],
        s.sol_ejng_id AS [sol_ejng_id],
        COALESCE(e.ejng_nombre, u.${columns.usrNombre}) AS [ejecutivo_nombre],
        co_exec.cop_nombre AS [ejecutivo_area],
        NULL AS [auxiliar_id],
        NULL AS [auxiliar_nombre],
        NULL AS [auxiliar_area],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_envio AS [sol_fecha_envio],
        s.sol_fecha_aprobacion AS [sol_fecha_aprobacion],
        s.sol_ses_id AS [sol_ses_id],
        s.sol_wet_id AS [sol_wet_id],
        we.wet_nombre AS [etapa_nombre],
        s.sol_wee_id AS [sol_wee_id],
        wr.wee_nombre AS [resultado_nombre],
        s.sol_formulario_version AS [sol_formulario_version],
        s.sol_fecha_est_gest_oc AS [sol_fecha_est_gest_oc],
        s.sol_fecha_gest_oc AS [sol_fecha_gest_oc],
        s.sol_fecha_est_gest_ejn AS [sol_fecha_est_gest_ejn],
        s.sol_fecha_gest_ejn AS [sol_fecha_gest_ejn],
        s.sol_fecha_est_gest_asc AS [sol_fecha_est_gest_asc],
        s.sol_fecha_gest_asc AS [sol_fecha_gest_asc],
        s.sol_fecha_est_gest_cc1 AS [sol_fecha_est_gest_cc1],
        s.sol_fecha_gest_cc1 AS [sol_fecha_gest_cc1],
        s.sol_fecha_est_gest_cc2 AS [sol_fecha_est_gest_cc2],
        s.sol_fecha_gest_cc2 AS [sol_fecha_gest_cc2],
        s.sol_cupo_aprobado AS [sol_cupo_aprobado],
        s.sol_cupo_solicitado AS [sol_cupo_solicitado],
        CAST(CASE WHEN ${SolicitudesListadosService.ES_AMPLIACION_CUPO_SQL} THEN 1 ELSE 0 END AS BIT) AS [es_ampliacion_cupo],
        s.sol_plazo_pago AS [sol_plazo_pago],
        s.sol_forma_pago AS [sol_forma_pago]
      FROM solicitudes s
      LEFT JOIN clientes c ON c.${columns.cliId} = s.sol_cli_id
      LEFT JOIN Ejecutivo_negocio e ON e.ejng_id = s.sol_ejng_id
      LEFT JOIN Centro_operacion co_exec ON co_exec.cop_id = e.cop_id
      LEFT JOIN usuarios u ON u.${columns.usrId} = s.sol_ejng_id
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_wet_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_wee_id
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
    filters?: {
      searchTerm?: string;
      estado?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    },
  ): Promise<SolicitudClienteDto[]> {
    let sql = `
    SELECT
      s.sol_id AS [sol_id],
      s.sol_numero AS [sol_numero],
      s.sol_ses_id AS [sol_ses_id],
      se.ses_codigo AS [estado_codigo],
      s.sol_wet_id AS [sol_wet_id],
      we.wet_codigo AS [etapa_codigo],
      s.sol_wee_id AS [sol_wee_id],
      wr.wee_codigo AS [resultado_codigo],
      s.sol_cli_id AS [sol_cli_id],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_created_at AS [sol_created_at],
      s.sol_updated_at AS [sol_updated_at],
      s.sol_consumo_mensual_proyectado AS [sol_consumo_mensual_proyectado],
      s.sol_es_zona_franca AS [sol_es_zona_franca],
      s.sol_version AS [sol_version],
      s.sol_formulario_version AS [sol_formulario_version],
      s.sol_cupo_aprobado AS [sol_cupo_aprobado],
      s.sol_cupo_solicitado AS [sol_cupo_solicitado],
      CAST(CASE WHEN ${SolicitudesListadosService.ES_AMPLIACION_CUPO_SQL} THEN 1 ELSE 0 END AS BIT) AS [es_ampliacion_cupo],
      s.sol_plazo_pago AS [sol_plazo_pago],
      s.sol_forma_pago AS [sol_forma_pago],
      s.sol_usr_id_apr_cond AS [sol_usr_id_apr_cond],
      s.sol_observacion_cliente AS [sol_observacion_cliente],
      c.cli_razon_social AS [cliente_nombre],
      c.cli_nro_identificacion AS [cliente_nit]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cli_id = c.cli_id
    LEFT JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
    LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_wet_id
    LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_wee_id
    WHERE s.sol_cli_id = @0
    `;

    const params: any[] = [clienteId];

    if (filters?.searchTerm) {
      sql += ` AND (
        s.sol_numero LIKE @1
        OR c.cli_razon_social LIKE @1
      )`;
      params.push(`%${filters.searchTerm}%`);
    }

    if (filters?.estado && filters.estado !== 'todos') {
      const paramIndex = params.length;
      sql += ` AND s.sol_ses_id = @${paramIndex}`;
      params.push(Number(filters.estado));
    }

    if (filters?.fechaDesde) {
      const paramIndex = params.length;
      sql += ` AND s.sol_fecha_creacion >= @${paramIndex}`;
      params.push(filters.fechaDesde);
    }

    if (filters?.fechaHasta) {
      // +1 día para que "hasta" incluya todo el día seleccionado, no solo
      // desde la medianoche (sol_fecha_creacion trae hora).
      const paramIndex = params.length;
      sql += ` AND s.sol_fecha_creacion < DATEADD(day, 1, @${paramIndex})`;
      params.push(filters.fechaHasta);
    }

    sql += ` ORDER BY s.sol_fecha_creacion DESC`;

    return await this.dataSource.query(sql, params);
  }

  async getSolicitudesPendientes(): Promise<SolicitudPendienteDto[]> {
    const sql = `
    SELECT
      s.sol_id AS [sol_id],
      s.sol_numero AS [sol_numero],
      s.sol_cli_id AS [sol_cli_id],
      c.cli_razon_social AS [cliente_nombre],
      s.sol_ses_id AS [sol_ses_id],
      e.descripcion AS [estado_descripcion],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_wet_id AS [sol_wet_id],
      s.sol_wee_id AS [sol_wee_id]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cli_id = c.cli_id
    LEFT JOIN solicitud_estados e ON e.est_id = s.sol_ses_id
    WHERE s.sol_ses_id = 2
    ORDER BY s.sol_fecha_creacion DESC
  `;
    return await this.dataSource.query(sql);
  }

  async getSolicitudesPendientesPorEjecutivoId(
    usuarioId: number,
    ejecutivoIdOverride?: number,
  ) {
    if (!usuarioId) {
      throw new Error('No se proporcionó usuario ID');
    }

    // `ejecutivoIdOverride` (un ejng_id real) reemplaza la resolución normal
    // vía `usuarios.ejng_id` — lo usa un usuario que no es él mismo un
    // Ejecutivo de Negocios pero tiene permiso de editar esta bandeja para
    // consultar la de cualquier ejecutivo (ver controller).
    let ejecutivoId: number | null;
    if (ejecutivoIdOverride) {
      ejecutivoId = ejecutivoIdOverride;
    } else {
      const usuarioResult = await this.dataSource.query(
        `SELECT usr_id, ejng_id FROM usuarios WHERE usr_id = @0`,
        [usuarioId],
      );

      if (!usuarioResult || usuarioResult.length === 0) {
        throw new Error(`Usuario ${usuarioId} no encontrado`);
      }

      ejecutivoId = usuarioResult[0].ejng_id;
    }

    if (!ejecutivoId) {
      return [];
    }

    const columns = await this.resolveLookupColumns();

    const sql = `
    SELECT
      s.sol_id AS [sol_id],
      s.sol_numero AS [sol_numero],
      s.sol_ses_id AS [sol_ses_id],
      s.sol_cli_id AS [sol_cli_id],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_fecha_envio AS [sol_fecha_envio],
      COALESCE(fe_vigente.swh_fecha_estimada, s.sol_fecha_est_gest_ejn) AS [sol_fecha_est_gest_ejn],
      s.sol_created_at AS [sol_created_at],
      s.sol_updated_at AS [sol_updated_at],
      s.sol_consumo_mensual_proyectado AS [sol_consumo_mensual_proyectado],
      s.sol_es_zona_franca AS [sol_es_zona_franca],
      s.sol_version AS [sol_version],
      s.sol_formulario_version AS [sol_formulario_version],
      s.sol_cupo_solicitado AS [sol_cupo_solicitado],
      CAST(CASE WHEN ${SolicitudesListadosService.ES_AMPLIACION_CUPO_SQL} THEN 1 ELSE 0 END AS BIT) AS [es_ampliacion_cupo],
      c.${columns.cliRazonSocial} AS [cliente_nombre],
      c.cli_nro_identificacion AS [cliente_nit],
      cop_cli.cop_id AS [sol_co_id],
      cop_cli.cop_nombre AS [centro_operacion_nombre]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cli_id = c.${columns.cliId}
    LEFT JOIN Ejecutivo_negocio en_cli ON en_cli.ejng_id = c.ejng_id
    LEFT JOIN Centro_operacion cop_cli ON cop_cli.cop_id = en_cli.cop_id
    OUTER APPLY (
      -- Ancla siempre a la etapa EJN específicamente, no a
      -- sol_wet_id -- si se usara la etapa actual, una solicitud
      -- que ya está en Auxiliar/Comité mostraría la fecha estimada de esa
      -- otra etapa bajo la etiqueta "ejecutivo".
      SELECT TOP 1 swh.swh_fecha_estimada
      FROM solicitud_workflow_historial swh
      WHERE swh.swh_sol_id = s.sol_id
        AND swh.swh_etapa_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN')
      ORDER BY swh.swh_fecha DESC
    ) fe_vigente
    WHERE s.sol_ejng_id = @0
      AND s.sol_ses_id = 2
      -- sol_ses_id = 2 (PENDIENTE) por sí solo no basta: también es el
      -- estado de "cliente esperando firma" (CLI/PEND_FIRMA,
      -- antes de llegar a EJN) y de "auxiliar rechazó, cliente corrigiendo"
      -- (ASC/RECHAZADO cliente_actualiza, después de EJN). Sin este filtro,
      -- ambos casos aparecían en la bandeja del ejecutivo aunque no le
      -- tocara actuar todavía (o ya nunca más).
      AND s.sol_wet_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN')
    ORDER BY s.sol_fecha_creacion DESC
  `;

    return await this.dataSource.query(sql, [ejecutivoId]);
  }

  // Bandeja del ejecutivo de negocios para solicitudes rechazadas de forma
  // definitiva por Oficial de Cumplimiento o Comité de Crédito 2 (ver
  // guardarConceptoGenerico) — el ejecutivo asignado debe gestionar el
  // seguimiento con el cliente por fuera del sistema y marcarlo "Finalizar"
  // cuando termine (sol_gestion_rechazo_finalizada). No incluye solicitudes
  // rechazadas antes de que existiera esta funcionalidad (backfill en
  // 20260726_agregar_gestion_rechazo_ejecutivo.sql las marca como ya
  // finalizadas).
  async getSolicitudesRechazadasPorEjecutivoId(usuarioId: number) {
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
      s.sol_numero AS [sol_numero],
      s.sol_ses_id AS [sol_ses_id],
      s.sol_wet_id AS [sol_wet_id],
      s.sol_cli_id AS [sol_cli_id],
      s.sol_fecha_creacion AS [sol_fecha_creacion],
      s.sol_gestion_rechazo_finalizada AS [sol_gestion_rechazo_finalizada],
      c.${columns.cliRazonSocial} AS [cliente_nombre],
      c.cli_nro_identificacion AS [cliente_nit],
      cop_cli.cop_id AS [sol_co_id],
      cop_cli.cop_nombre AS [centro_operacion_nombre],
      mr.mrs_descripcion AS [motivo_rechazo],
      rechazo.etapa_rechazo_codigo AS [etapa_rechazo_codigo],
      rechazo.etapa_rechazo_nombre AS [etapa_rechazo_nombre],
      rechazo.usuario_rechazo_nombre AS [usuario_rechazo_nombre],
      rechazo.fecha_rechazo AS [fecha_rechazo],
      rechazo.comentario_rechazo AS [comentario_rechazo]
    FROM solicitudes s
    LEFT JOIN clientes c ON s.sol_cli_id = c.${columns.cliId}
    LEFT JOIN Ejecutivo_negocio en_cli ON en_cli.ejng_id = c.ejng_id
    LEFT JOIN Centro_operacion cop_cli ON cop_cli.cop_id = en_cli.cop_id
    LEFT JOIN Motivos_rechazo_solicitud mr ON mr.mrs_id = s.sol_mrs_id
    OUTER APPLY (
      SELECT TOP 1
        we.wet_codigo AS etapa_rechazo_codigo,
        we.wet_nombre AS etapa_rechazo_nombre,
        u2.usr_nombre AS usuario_rechazo_nombre,
        swh.swh_fecha AS fecha_rechazo,
        swh.swh_comentario AS comentario_rechazo
      FROM solicitud_workflow_historial swh
      LEFT JOIN workflow_etapas we ON we.wet_id = swh.swh_etapa_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = swh.swh_resultado_id
      LEFT JOIN usuarios u2 ON u2.usr_id = swh.swh_usuario_id
      WHERE swh.swh_sol_id = s.sol_id
        AND wr.wee_codigo = 'RECHAZADO'
        AND we.wet_codigo IN ('OFC', 'CC2')
      ORDER BY swh.swh_fecha DESC
    ) rechazo
    WHERE s.sol_ejng_id = @0
      AND s.sol_ses_id = (SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'RECHAZADA')
      AND s.sol_wet_id IN (
        SELECT wet_id FROM workflow_etapas WHERE wet_codigo IN ('OFC', 'CC2')
      )
      AND s.sol_gestion_rechazo_finalizada = 0
    ORDER BY rechazo.fecha_rechazo DESC
  `;

    return await this.dataSource.query(sql, [ejecutivoId]);
  }

  // Detalle de una solicitud rechazada para la bandeja del ejecutivo: motivo,
  // etapa/usuario/fecha/comentario del rechazo (mismo OUTER APPLY que
  // getSolicitudesRechazadasPorEjecutivoId), y estado de la gestión manual.
  async getRechazoEjecutivoDetalle(solicitudId: number) {
    const [row] = await this.dataSource.query(
      `
      SELECT
        s.sol_id,
        s.sol_mrs_id,
        mr.mrs_descripcion AS motivo_rechazo,
        s.sol_gestion_rechazo_finalizada,
        s.sol_fecha_gestion_rechazo,
        u.usr_nombre AS usuario_gestion_nombre,
        rechazo.etapa_rechazo_codigo,
        rechazo.etapa_rechazo_nombre,
        rechazo.usuario_rechazo_nombre,
        rechazo.fecha_rechazo,
        rechazo.comentario_rechazo
      FROM solicitudes s
      LEFT JOIN Motivos_rechazo_solicitud mr ON mr.mrs_id = s.sol_mrs_id
      LEFT JOIN usuarios u ON u.usr_id = s.sol_usr_id_gest_rechazo
      OUTER APPLY (
        SELECT TOP 1
          we.wet_codigo AS etapa_rechazo_codigo,
          we.wet_nombre AS etapa_rechazo_nombre,
          u2.usr_nombre AS usuario_rechazo_nombre,
          swh.swh_fecha AS fecha_rechazo,
          swh.swh_comentario AS comentario_rechazo
        FROM solicitud_workflow_historial swh
        LEFT JOIN workflow_etapas we ON we.wet_id = swh.swh_etapa_id
        LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = swh.swh_resultado_id
        LEFT JOIN usuarios u2 ON u2.usr_id = swh.swh_usuario_id
        WHERE swh.swh_sol_id = s.sol_id
          AND wr.wee_codigo = 'RECHAZADO'
          AND we.wet_codigo IN ('OFC', 'CC2')
        ORDER BY swh.swh_fecha DESC
      ) rechazo
      WHERE s.sol_id = @0
      `,
      [solicitudId],
    );
    return row ?? null;
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
      whereClauses.push(`s.sol_wet_id = ${filtros.etapa_id}`);
    }

    if (filtros?.resultado_etapa_id !== undefined) {
      whereClauses.push(`s.sol_wee_id = ${filtros.resultado_etapa_id}`);
    }

    if (filtros?.estado_id !== undefined) {
      whereClauses.push(`s.sol_ses_id = ${filtros.estado_id}`);
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
        sol_numero AS [sol_numero],
        sol_cli_id AS [sol_cli_id],
        sol_ses_id AS [sol_ses_id],
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
        s.sol_numero AS [sol_numero],
        s.sol_ses_id AS [sol_ses_id],
        s.sol_wet_id AS [sol_wet_id],
        s.sol_wee_id AS [sol_wee_id],
        we.wet_codigo AS [etapa_codigo],
        wr.wee_codigo AS [resultado_codigo],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_envio AS [sol_fecha_envio],
        c.cli_razon_social AS [cliente_nombre],
        c.cli_nro_identificacion AS [cliente_nit]
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cli_id
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_wet_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_wee_id
      WHERE s.sol_cli_id = @0
      ORDER BY s.sol_fecha_creacion DESC
    `;
    const result = await this.dataSource.query(sql, [clienteId]);
    return result[0] || null;
  }

  // Igual que obtenerUltimaSolicitud pero solo considera solicitudes
  // APROBADAS (sol_ses_id = 5) — usado para decidir si el cliente es
  // candidato a "Ampliación de Cupo" y para precargar respuestas desde su
  // última solicitud aprobada (no desde cualquier solicitud previa, que
  // podría estar rechazada/cancelada/en trámite).
  async obtenerUltimaSolicitudAprobada(clienteId: number) {
    const sql = `
      SELECT TOP 1
        s.sol_id AS [sol_id],
        s.sol_numero AS [sol_numero],
        s.sol_ses_id AS [sol_ses_id],
        s.sol_wet_id AS [sol_wet_id],
        s.sol_wee_id AS [sol_wee_id],
        we.wet_codigo AS [etapa_codigo],
        wr.wee_codigo AS [resultado_codigo],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_envio AS [sol_fecha_envio],
        s.sol_cupo_aprobado AS [sol_cupo_aprobado],
        c.cli_razon_social AS [cliente_nombre],
        c.cli_nro_identificacion AS [cliente_nit]
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cli_id
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_wet_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_wee_id
      WHERE s.sol_cli_id = @0 AND s.sol_ses_id = 5
      ORDER BY s.sol_fecha_creacion DESC
    `;
    const result = await this.dataSource.query(sql, [clienteId]);
    return result[0] || null;
  }

  // Igual que obtenerUltimaSolicitud pero por sol_id — usado por el
  // personal interno para gestionar documentos de una solicitud puntual
  // (ej. GET /solicitudes/mis-documentos?solicitudId=X en modo staff).
  async obtenerSolicitudPorId(solicitudId: number) {
    const sql = `
      SELECT TOP 1
        s.sol_id AS [sol_id],
        s.sol_numero AS [sol_numero],
        s.sol_ses_id AS [sol_ses_id],
        s.sol_wet_id AS [sol_wet_id],
        s.sol_wee_id AS [sol_wee_id],
        we.wet_codigo AS [etapa_codigo],
        wr.wee_codigo AS [resultado_codigo],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_envio AS [sol_fecha_envio],
        c.cli_razon_social AS [cliente_nombre],
        c.cli_nro_identificacion AS [cliente_nit]
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cli_id
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_wet_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_wee_id
      WHERE s.sol_id = @0
    `;
    const result = await this.dataSource.query(sql, [solicitudId]);
    return result[0] || null;
  }

  async obtenerUltimaSolicitudPendiente(clienteId: number) {
    const sql = `
      SELECT TOP 1
        sol_id AS [sol_id],
        sol_numero AS [sol_numero]
      FROM solicitudes
      WHERE sol_cli_id = @0 AND sol_ses_id = 2
      ORDER BY sol_id DESC
    `;
    const result = await this.dataSource.query(sql, [clienteId]);
    return result[0] || null;
  }

  async obtenerUltimaSolicitudCompletada(clienteId: number) {
    const sql = `
      SELECT TOP 1
        sol_id AS [sol_id],
        sol_numero AS [sol_numero]
      FROM solicitudes
      WHERE sol_cli_id = @0 AND sol_ses_id NOT IN (1, 2, 3)
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
      `s.sol_wet_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'ASC')
       AND s.sol_wee_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  async getSolicitudesParaOC(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_wet_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'OFC')
       AND s.sol_wee_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  async getSolicitudesParaComiteCredito1(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_wet_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC1')
       AND s.sol_wee_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  async getSolicitudesParaComiteCredito2(usuarioId: number) {
    const columns = await this.resolveLookupColumns();
    const sql = this.buildSolicitudesQuery(
      columns,
      `s.sol_wet_id = (SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC2')
       AND s.sol_wee_id = (SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE')`,
    );
    return await this.dataSource.query(sql);
  }

  private buildSolicitudesQuery(columns: any, whereClause: string): string {
    return `
      SELECT
        s.sol_id AS [sol_id],
        s.sol_numero AS [sol_numero],
        s.sol_cli_id AS [sol_cli_id],
        c.${columns.cliRazonSocial} AS [cliente_nombre],
        s.sol_ses_id AS [sol_ses_id],
        s.sol_wet_id AS [sol_wet_id],
        s.sol_wee_id AS [sol_wee_id],
        s.sol_fecha_creacion AS [sol_fecha_creacion],
        s.sol_fecha_envio AS [sol_fecha_envio],
        CASE WHEN we.wet_codigo = 'ASC' THEN COALESCE(fe_vigente.swh_fecha_estimada, s.sol_fecha_est_gest_asc) ELSE s.sol_fecha_est_gest_asc END AS [sol_fecha_est_gest_asc],
        CASE WHEN we.wet_codigo = 'OFC' THEN COALESCE(fe_vigente.swh_fecha_estimada, s.sol_fecha_est_gest_oc) ELSE s.sol_fecha_est_gest_oc END AS [sol_fecha_est_gest_oc],
        CASE WHEN we.wet_codigo = 'CC1' THEN COALESCE(fe_vigente.swh_fecha_estimada, s.sol_fecha_est_gest_cc1) ELSE s.sol_fecha_est_gest_cc1 END AS [sol_fecha_est_gest_cc1],
        CASE WHEN we.wet_codigo = 'CC2' THEN COALESCE(fe_vigente.swh_fecha_estimada, s.sol_fecha_est_gest_cc2) ELSE s.sol_fecha_est_gest_cc2 END AS [sol_fecha_est_gest_cc2],
        -- Fecha en que la etapa INMEDIATAMENTE ANTERIOR del flujo
        -- (CLI->EJN->ASC->OFC->CC1->CC2) completó su gestión — cada página
        -- de bandeja (ASC/OFC/CC1/CC2) usa solo la columna de su
        -- antecesor real, ver gestion-*/page.tsx.
        s.sol_fecha_gest_ejn AS [sol_fecha_gest_ejn],
        s.sol_fecha_gest_asc AS [sol_fecha_gest_asc],
        s.sol_fecha_gest_oc AS [sol_fecha_gest_oc],
        s.sol_fecha_gest_cc1 AS [sol_fecha_gest_cc1],
        s.sol_consumo_mensual_proyectado AS [consumo_mensual_proyectado],
        s.sol_observacion_ejn AS [observacionesComercial],
        s.sol_cupo_solicitado AS [sol_cupo_solicitado],
        CAST(CASE WHEN ${SolicitudesListadosService.ES_AMPLIACION_CUPO_SQL} THEN 1 ELSE 0 END AS BIT) AS [es_ampliacion_cupo],
        we.wet_nombre AS [etapa_nombre],
        wr.wee_nombre AS [resultado_nombre],
        s.sol_ejng_id AS [sol_ejng_id],
        u.${columns.usrNombre} AS [ejecutivo_nombre],
        cop_cli.cop_id AS [sol_co_id],
        cop_cli.cop_nombre AS [centro_operacion_nombre]
      FROM solicitudes s
      LEFT JOIN clientes c ON s.sol_cli_id = c.${columns.cliId}
      LEFT JOIN usuarios u ON s.sol_ejng_id = u.${columns.usrId}
      LEFT JOIN Ejecutivo_negocio en_cli ON en_cli.ejng_id = c.ejng_id
      LEFT JOIN Centro_operacion cop_cli ON cop_cli.cop_id = en_cli.cop_id
      LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_wet_id
      LEFT JOIN workflow_estado_etapa wr ON wr.wee_id = s.sol_wee_id
      OUTER APPLY (
        SELECT TOP 1 swh.swh_fecha_estimada
        FROM solicitud_workflow_historial swh
        WHERE swh.swh_sol_id = s.sol_id AND swh.swh_etapa_id = s.sol_wet_id
        ORDER BY swh.swh_fecha DESC
      ) fe_vigente
      WHERE ${whereClause}
      ORDER BY s.sol_fecha_creacion DESC
    `;
  }
}
