// src/solicitudes/solicitudes.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { mkdir, cp, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { addBusinessDays } from '../common/utils/business-days.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';
import { WorkflowService } from './workflow.service';
import { SolicitudesWorkflowService } from './solicitudes-workflow.service';
import { FormularioRenderizableService } from './formulario-renderizable.service';
import { MailService } from '../mail/mail.service';
import { PDFDocument, rgb } from 'pdf-lib';
import { WorkflowEtapaResponseDto } from './dto/workflow-etapa.response.dto';
import { WorkflowResultadoResponseDto } from './dto/workflow-resultado.response.dto';
import { ParamDiasRespuestaResponseDto } from './dto/param-dias-respuesta.response.dto';

@Injectable()
export class SolicitudesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesService: NotificacionesService,
    private readonly historialWorkflowService: HistorialWorkflowService,
    private readonly workflowService: WorkflowService,
    private readonly solicitudesWorkflowService: SolicitudesWorkflowService,
    private readonly formularioRenderizableService: FormularioRenderizableService,
    private readonly mailService: MailService,
  ) {}

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

  private async resolveHistorialColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_sol_id') IS NOT NULL THEN 'seh_sol_id' ELSE 'solicitud_id' END AS solicitud_col,
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_estado_id') IS NOT NULL THEN 'seh_estado_id' ELSE 'estado_id' END AS estado_col,
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_usr_id') IS NOT NULL THEN 'seh_usr_id' ELSE 'usr_id' END AS usuario_col,
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_fecha_hora') IS NOT NULL THEN 'seh_fecha_hora' ELSE 'fecha_hora' END AS fecha_col
    `);

    return result[0];
  }

  async crearSolicitud(body: any) {
    console.log(
      '📦 Body recibido (SQL directo):',
      JSON.stringify(body, null, 2),
    );

    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Validar
      const clienteId = body.cliente_id || body.solicitud?.cliente_id;
      const coId = body.co_id || body.solicitud?.co_id;

      if (!clienteId || !coId) {
        throw new Error('Faltan cliente_id o co_id');
      }

      // 2. Asegurar esZonaFranca
      const esZonaFranca =
        body.esZonaFranca ?? body.solicitud?.esZonaFranca ?? false;
      console.log('⚠️  Usando esZonaFranca:', esZonaFranca);

      // 3. Generar número único del consecutivo
      const numeroSolicitud = await this.obtenerSiguienteNumeroSolicitud(
        coId,
        queryRunner,
      );
      const now = new Date();

      // Obtener días configurados para cada etapa del workflow
      const diasRespuestaEjecResult = await queryRunner.query(`
        SELECT TOP 1 pdr_dias
        FROM param_dias_respuesta_solicitudes
        WHERE pdr_estado = 1
          AND UPPER(LTRIM(RTRIM(pdr_area))) = 'EJECUTIVO NEGOCIOS'
        ORDER BY pdr_id DESC
      `);
      const diasRespuestaEjecutivo = Number(
        diasRespuestaEjecResult?.[0]?.pdr_dias ?? 1,
      );

      const diasRespuestaAuxResult = await queryRunner.query(`
        SELECT TOP 1 pdr_dias
        FROM param_dias_respuesta_solicitudes
        WHERE pdr_estado = 1
          AND UPPER(LTRIM(RTRIM(pdr_area))) = 'AUXILIAR SERVICIO CLIENTE'
        ORDER BY pdr_id DESC
      `);
      const diasRespuestaAuxiliar = Number(
        diasRespuestaAuxResult?.[0]?.pdr_dias ?? 3,
      );

      const diasRespuestaOficialResult = await queryRunner.query(`
        SELECT TOP 1 pdr_dias
        FROM param_dias_respuesta_solicitudes
        WHERE pdr_estado = 1
          AND UPPER(LTRIM(RTRIM(pdr_area))) = 'OFICIAL CUMPLIMIENTO'
        ORDER BY pdr_id DESC
      `);
      const diasRespuestaOficial = Number(
        diasRespuestaOficialResult?.[0]?.pdr_dias ?? 3,
      );

      const diasRespuestaCC1Result = await queryRunner.query(`
        SELECT TOP 1 pdr_dias
        FROM param_dias_respuesta_solicitudes
        WHERE pdr_estado = 1
          AND UPPER(LTRIM(RTRIM(pdr_area))) = 'COMITÉ CRÉDITO 1'
        ORDER BY pdr_id DESC
      `);
      const diasRespuestaCC1 = Number(
        diasRespuestaCC1Result?.[0]?.pdr_dias ?? 3,
      );

      const diasRespuestaCC2Result = await queryRunner.query(`
        SELECT TOP 1 pdr_dias
        FROM param_dias_respuesta_solicitudes
        WHERE pdr_estado = 1
          AND UPPER(LTRIM(RTRIM(pdr_area))) = 'COMITÉ CRÉDITO 2'
        ORDER BY pdr_id DESC
      `);
      const diasRespuestaCC2 = Number(
        diasRespuestaCC2Result?.[0]?.pdr_dias ?? 3,
      );

      let festivos: any[] = [];
      try {
        const festivosResult = await queryRunner.query(
          `
          SELECT fes_fecha AS fecha
          FROM Festivos
          WHERE fes_co_id = @0 OR fes_co_id IS NULL
        `,
          [coId],
        );
        festivos = (festivosResult || [])
          .map((row: any) => row?.fecha)
          .filter((value: any) => Boolean(value));
      } catch (error) {
        console.warn('⚠️ Tabla festivos no encontrada, usando array vacío');
        festivos = [];
      }

      const fechaEstimadaEjecutivo = addBusinessDays(
        now,
        diasRespuestaEjecutivo,
        festivos,
      );

      const fechaEstimadaAuxiliar = addBusinessDays(
        now,
        diasRespuestaAuxiliar,
        festivos,
      );

      const fechaEstimadaOficial = addBusinessDays(
        now,
        diasRespuestaOficial,
        festivos,
      );

      const fechaEstimadaCC1 = addBusinessDays(now, diasRespuestaCC1, festivos);

      const fechaEstimadaCC2 = addBusinessDays(now, diasRespuestaCC2, festivos);

      const formularioActivoResult = await queryRunner.query(`
        SELECT TOP 1 (
          SELECT MAX(fv.fv_numero)
          FROM Formulario_versiones fv
          WHERE fv.fv_frm_id = f.frm_id
        ) AS formulario_version
        FROM formularios f
        WHERE f.frm_activo = 1
        ORDER BY f.frm_id
      `);
      const formularioVersion = Number(
        formularioActivoResult?.[0]?.formulario_version ?? 1,
      );

      // 3.5 Obtener datos del cliente (ejecutivo e identificación)
      const clienteResult = await queryRunner.query(
        `SELECT ejng_id, cli_nro_identificacion FROM clientes WHERE cli_id = @0`,
        [clienteId],
      );
      const ejecutivoId = clienteResult?.[0]?.ejng_id || null;
      const nroIdentificacionCliente =
        clienteResult?.[0]?.cli_nro_identificacion || null;

      // 4. SQL para insertar solicitud - USAR @0, @1, @2... para SQL Server
      const insertSolicitudSQL = `
        INSERT INTO solicitudes (
          sol_cliente_id, sol_estado_id, sol_co_id,
          sol_razon_social, sol_nit_documento, sol_direccion, sol_telefono,
          sol_consumo_mensual_proyectado, sol_fecha_creacion, sol_created_at,
          sol_updated_at, sol_version, sol_formulario_version, sol_usuario_crea,
          sol_numero_solicitud, sol_es_zona_franca,
          sol_ejecutivo_id, sol_fecha_envio,
          sol_fecha_estimada_ejecutivo, sol_fecha_estimada_auxiliar_servicio_cliente,
          sol_fecha_estimada_oficial_cumplimiento, sol_fecha_estimada_comite_credito_1,
          sol_fecha_estimada_comite_credito_2,
          sol_motivo_rechazo_id, sol_usuario_modifica,
          sol_etapa_actual_id, sol_resultado_etapa_id
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, @7, @8, @9,
          @10, @11, @12, @13, @14, @15, @16, @17, @18, @19,
          @20, @21, @22, @23, @24, @25, @26
        );

        SELECT SCOPE_IDENTITY() AS sol_id;
      `;

      // 4.5 Obtener IDs de la nueva estructura de workflow (etapas CLI y EJN, resultado PENDIENTE)
      const etapasClienteResult = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CLI'`,
      );
      const etapaClienteId = etapasClienteResult?.[0]?.wet_id;

      const etapasCenResult = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN'`,
      );
      const etapaCenId = etapasCenResult?.[0]?.wet_id;

      const resultadosResult = await queryRunner.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE'`,
      );
      const resultadoPdId = resultadosResult?.[0]?.wee_id;

      if (!etapaClienteId || !etapaCenId || !resultadoPdId) {
        throw new Error(
          'No se encontraron las tablas workflow_etapas o workflow_estado_etapa. Verifica que existan las etapas CLI y EJN.',
        );
      }

      // 5. Determinar estado inicial y fecha envío
      const estadoId = body.estado_id || 1; // Default a BORRADOR si no se especifica
      const fechaEnvio = estadoId === 2 ? now : null; // Si es PENDIENTE, establecer fecha de envío

      // 5.1 Determinar etapa inicial según el estado
      // BORRADOR (1) → CLI, PENDIENTE (2) → EJN
      const etapaActualId = estadoId === 1 ? etapaClienteId : etapaCenId;

      // 5.1 Parámetros en ARRAY en el ORDEN CORRECTO
      const solicitudParams = [
        // Campos NOT NULL
        clienteId, // @0
        estadoId, // @1 estado_id (1=BORRADOR, 2=PENDIENTE, 3=REVISIÓN, 4=COMPLETADA)
        coId, // @2

        // Campos NULLABLE
        body.razonSocial || body.solicitud?.razonSocial || null, // @3
        body.nitDocumento ||
          body.solicitud?.nitDocumento ||
          nroIdentificacionCliente ||
          null, // @4
        body.direccion || body.solicitud?.direccion || null, // @5
        body.telefono || body.solicitud?.telefono || null, // @6
        body.consumoMensualProyectado ||
          body.solicitud?.consumoMensualProyectado ||
          null, // @7

        // Fechas
        now, // @8 fecha_creacion
        now, // @9 created_at
        now, // @10 updated_at

        // Versiones
        1, // @11 version
        formularioVersion, // @12 formulario_version

        // Usuario (puede ser NULL si es un cliente)
        body.usuario_crea || null, // @13 usuario_crea

        // Número de solicitud y zona franca
        numeroSolicitud, // @14 numero_solicitud
        esZonaFranca ? 1 : 0, // @15 es_zona_franca

        // ejecutivo_id heredado del cliente
        ejecutivoId, // @16 ejecutivo_id
        fechaEnvio, // @17 fecha_envio (now si estado_id=2, null si estado_id=1)

        // Fechas estimadas para cada etapa del workflow
        fechaEstimadaEjecutivo, // @18 sol_fecha_estimada_ejecutivo
        fechaEstimadaAuxiliar, // @19 sol_fecha_estimada_auxiliar_servicio_cliente
        fechaEstimadaOficial, // @20 sol_fecha_estimada_oficial_cumplimiento
        fechaEstimadaCC1, // @21 sol_fecha_estimada_comite_credito_1
        fechaEstimadaCC2, // @22 sol_fecha_estimada_comite_credito_2

        null, // @23 motivo_rechazo_id
        null, // @24 usuario_modifica
        etapaActualId, // @25 sol_etapa_actual_id (CLI si BORRADOR, EJN si PENDIENTE)
        resultadoPdId, // @26 sol_resultado_etapa_id (PENDIENTE)
      ];

      console.log('🚀 Ejecutando SQL directo para solicitud...');
      console.log('📊 SQL:', insertSolicitudSQL);
      console.log('📊 Parámetros:', solicitudParams);
      console.log('📊 Parámetros detallado:');
      solicitudParams.forEach((p, i) => {
        console.log(`  @${i}: ${typeof p} = ${JSON.stringify(p)}`);
      });

      const solicitudResult = await queryRunner.query(
        insertSolicitudSQL,
        solicitudParams,
      );
      const solicitudId = solicitudResult[0]?.sol_id;

      if (!solicitudId) {
        throw new Error('No se obtuvo ID de la solicitud');
      }

      console.log('✅ Solicitud creada con ID:', solicitudId);

      // 6. Registrar en historial de estados
      const histCols = await this.resolveHistorialColumns();
      const historialSQL = `
        INSERT INTO Solicitudes_estados_hist
        (${histCols.solicitud_col}, ${histCols.estado_col}, ${histCols.usuario_col}, ${histCols.fecha_col})
        VALUES (@0, @1, @2, GETDATE())
      `;
      const usuarioHistorial = body.usuario_crea || 1; // Usuario que crea, o 1 si es cliente
      await queryRunner.query(historialSQL, [
        solicitudId,
        estadoId,
        usuarioHistorial,
      ]);
      console.log(`✅ Historial de estado registrado (estado_id=${estadoId})`);

      // 6.5 Registrar transición inicial en workflow historial SOLO si no es BORRADOR
      // BORRADOR es solo un estado local de edición, no forma parte del workflow
      if (estadoId !== 1) {
        const etapaTransicion = estadoId === 2 ? etapaCenId : null;
        const mensajeTransicion = 'Solicitud enviada a Ejecutivo de Negocios';
        if (etapaTransicion) {
          await this.historialWorkflowService.registrarTransicion(
            solicitudId,
            etapaTransicion,
            resultadoPdId,
            1, // usuario 1
            mensajeTransicion,
          );
          console.log('✅ Transición inicial de workflow registrada');
        }
      } else {
        console.log(
          '✅ Estado BORRADOR: No se registra en workflow_historial (solo en estados_hist)',
        );
      }

      // 7. Insertar respuestas (también con parámetros nombrados)
      if (body.respuestas?.length > 0) {
        console.log(`📝 Insertando ${body.respuestas.length} respuestas...`);

        for (const respuesta of body.respuestas) {
          const insertRespuestaSQL = `
            INSERT INTO Formulario_respuesta
            (fr_solicitud_id, fr_fp_id, fr_valor_texto, fr_valor_numero, fr_valor_fecha, fr_valor_opcion_id, fr_created_at)
            VALUES (@0, @1, @2, @3, @4, @5, @6)
          `;

          const respuestaParams = [
            solicitudId, // @0
            respuesta.fp_id, // @1
            respuesta.valor_texto || null, // @2
            respuesta.valor_numero || null, // @3
            respuesta.valor_fecha || null, // @4
            respuesta.valor_opcion_id || null, // @5
            now, // @6
          ];

          await queryRunner.query(insertRespuestaSQL, respuestaParams);
        }

        console.log('✅ Respuestas insertadas');
      }

      // 8. Commit
      await queryRunner.commitTransaction();

      try {
        await this.notificacionesService.notificarRegistroSolicitud(
          Number(solicitudId),
          false,
        );
      } catch (notificationError: any) {
        console.error(
          '⚠️ Error enviando notificaciones de registro:',
          notificationError?.message || notificationError,
        );
      }

      return {
        ok: true,
        solicitud_id: solicitudId,
        numero_solicitud: numeroSolicitud,
        mensaje: 'Solicitud creada exitosamente con SQL directo',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error en SQL directo:', error.message);
      console.error('❌ Stack:', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===== MÉTODOS ADICIONALES =====

  async cambiarEstado(
    solicitudId: number,
    estadoId: number,
    usuarioId: number = 1,
  ) {
    const histCols = await this.resolveHistorialColumns();
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Capturar el estado previo para saber si esta es una transición real
      // hacia PENDIENTE (evita notificar dos veces cuando una solicitud nueva
      // se crea directamente con estado PENDIENTE y luego se llama a este
      // método de forma redundante con el mismo estado).
      const estadoPrevioResult = await queryRunner.query(
        `SELECT sol_estado_id FROM solicitudes WHERE sol_id = @0`,
        [solicitudId],
      );
      const estadoPrevio = estadoPrevioResult?.[0]?.sol_estado_id ?? null;

      // Verificar si la solicitud está en estado PENDIENTE + etapa ASC + resultado RECHAZADO
      // Si se está cambiando a REVISIÓN, cambiar también el resultado a PENDIENTE
      let resultadoIdActualizar: number | null = null;

      if (estadoId === 3) {
        // Cambio a REVISIÓN - verificar caso especial
        const solicitudActual = await queryRunner.query(
          `SELECT sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id
           FROM solicitudes
           WHERE sol_id = @0`,
          [solicitudId],
        );

        if (solicitudActual.length > 0) {
          const { sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id } =
            solicitudActual[0];

          // ASC = 3, RECHAZADO = 3, PENDIENTE = 1
          const estaPendiente = sol_estado_id === 2;
          const estaEnASC = sol_etapa_actual_id === 3;
          const estaRechazado = sol_resultado_etapa_id === 3;

          if (estaPendiente && estaEnASC && estaRechazado) {
            // Cambiar resultado a PENDIENTE cuando el cliente edita después de rechazo
            resultadoIdActualizar = 1;
            console.log(
              `✅ Caso especial detectado: Solicitud ${solicitudId} de Pendiente+ASC+Rechazado → Revisión. Resultado: PENDIENTE`,
            );
          }
        }
      }

      // Obtener etapas según el estado
      let etapaId: number | null = null;
      let mensajeTransicion = '';

      if (estadoId === 1) {
        // BORRADOR → Etapa CLI
        const etapaResult = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CLI'`,
        );
        etapaId = etapaResult?.[0]?.wet_id;
        mensajeTransicion =
          'Solicitud guardada como BORRADOR - Cliente llenando formulario';
      } else if (estadoId === 2) {
        // PENDIENTE → Etapa EJN
        const etapaResult = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN'`,
        );
        etapaId = etapaResult?.[0]?.wet_id;
        mensajeTransicion = 'Solicitud enviada a Ejecutivo de Negocios';
      }
      // Para estados 3+ (REVISIÓN, COMPLETADA), no cambiamos la etapa

      // Actualizar estado (y etapa si corresponde)
      let updateSQL = `
        UPDATE solicitudes
        SET sol_estado_id = @0,
            sol_updated_at = GETDATE(),
            sol_usuario_modifica = @1
      `;
      const params: any[] = [estadoId, usuarioId];

      if (etapaId !== null) {
        updateSQL += `, sol_etapa_actual_id = @2`;
        params.push(etapaId);
      }

      if (resultadoIdActualizar !== null) {
        updateSQL += `, sol_resultado_etapa_id = @${params.length}`;
        params.push(resultadoIdActualizar);
      }

      updateSQL += ` WHERE sol_id = @${params.length}`;
      params.push(solicitudId);

      await queryRunner.query(updateSQL, params);

      // Registrar en historial
      const historialSQL = `
        INSERT INTO Solicitudes_estados_hist
        (${histCols.solicitud_col}, ${histCols.estado_col}, ${histCols.usuario_col}, ${histCols.fecha_col})
        VALUES (@0, @1, @2, GETDATE())
      `;

      await queryRunner.query(historialSQL, [solicitudId, estadoId, usuarioId]);

      // Registrar transición de workflow si se cambió la etapa
      if (etapaId !== null) {
        const resultadoPdResult = await queryRunner.query(
          `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE'`,
        );
        const resultadoId = resultadoPdResult?.[0]?.wee_id;

        if (resultadoId) {
          const workflowHistorialSQL = `
            INSERT INTO solicitud_workflow_historial
            (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario, swh_fecha)
            VALUES (@0, @1, @2, @3, @4, GETDATE())
          `;
          await queryRunner.query(workflowHistorialSQL, [
            solicitudId,
            etapaId,
            resultadoId,
            usuarioId,
            mensajeTransicion,
          ]);
        }
      } else if (resultadoIdActualizar !== null) {
        // Registrar en historial si solo se cambió el resultado (sin cambiar etapa)
        const solicitudActual = await queryRunner.query(
          `SELECT sol_etapa_actual_id FROM solicitudes WHERE sol_id = @0`,
          [solicitudId],
        );

        if (solicitudActual.length > 0) {
          const { sol_etapa_actual_id } = solicitudActual[0];
          const workflowHistorialSQL = `
            INSERT INTO solicitud_workflow_historial
            (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario, swh_fecha)
            VALUES (@0, @1, @2, @3, @4, GETDATE())
          `;
          await queryRunner.query(workflowHistorialSQL, [
            solicitudId,
            sol_etapa_actual_id,
            resultadoIdActualizar,
            usuarioId,
            'Cliente editó solicitud rechazada - Resultado vuelve a PENDIENTE',
          ]);
        }
      }

      await queryRunner.commitTransaction();

      try {
        if (estadoId === 3 || estadoId === 4) {
          await this.notificacionesService.notificarEstadoSolicitud(
            solicitudId,
            estadoId,
          );
        } else if (estadoId === 2 && estadoPrevio !== 2) {
          // Transición real hacia PENDIENTE (p.ej. cliente envía un borrador
          // ya existente): notificar registro igual que al crear una
          // solicitud nueva, para que cliente/comercial/ejecutivo se enteren.
          await this.notificacionesService.notificarRegistroSolicitud(
            solicitudId,
            true,
          );
        }
      } catch (notificationError: any) {
        console.error(
          '⚠️ Error enviando notificación de estado:',
          notificationError?.message || notificationError,
        );
      }

      return { ok: true, mensaje: 'Estado actualizado' };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  async testConnection() {
    try {
      const result = await this.dataSource.query(
        'SELECT @@VERSION as version, GETDATE() as fecha',
      );
      return {
        ok: true,
        conectado: true,
        version: result[0]?.version?.substring(0, 100),
        fecha: result[0]?.fecha,
      };
    } catch (error) {
      return {
        ok: false,
        conectado: false,
        error: error.message,
      };
    }
  }

  async aprobarRechazarSolicitud(
    solicitudId: number,
    aprobado: boolean,
    motivo_rechazo_id?: number,
    modo_solucion?: string,
    fecha_estimada_respuesta_comercial?: Date,
    usuario_modifica?: number,
  ) {
    const histCols = await this.resolveHistorialColumns();
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (!aprobado && !motivo_rechazo_id) {
        throw new Error('motivo_rechazo_id es requerido cuando se rechaza');
      }

      // Obtener IDs de estados desde BD (sin hardcodear)
      const estadosRevisionResult = await queryRunner.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'REVISION'`,
      );
      const estadoRevision = estadosRevisionResult?.[0];

      const estadosPendienteResult = await queryRunner.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'PENDIENTE'`,
      );
      const estadoPendiente = estadosPendienteResult?.[0];

      // Obtener etapa ASC (Auxiliar Servicio Cliente - la que está procesando)
      const etapaSACResult = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'ASC'`,
      );
      const etapaSAC = etapaSACResult?.[0];

      console.log('[aprobarRechazarSolicitud] Estados y etapas:', {
        estadoRevision: estadoRevision?.ses_id,
        estadoPendiente: estadoPendiente?.ses_id,
        etapaSAC: etapaSAC?.wet_id,
        modo_solucion,
      });

      let etapaDestId: number;
      let estadoId: number;
      let resultadoCodigo: string;
      let comentario: string;

      if (aprobado) {
        // ASC aprueba → avanza a OFC en REVISIÓN
        const [etapaOFC] = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'OFC'`,
        );
        etapaDestId = etapaOFC.wet_id;
        estadoId = estadoRevision.ses_id;
        resultadoCodigo = 'PENDIENTE';
        comentario = 'Solicitud aprobada en Auxiliar Servicio Cliente';
      } else {
        // ASC rechaza → etapa ASC con resultado RECHAZADO
        // El estado depende del modo_solucion
        etapaDestId = etapaSAC.wet_id;
        resultadoCodigo = 'RECHAZADO';

        if (modo_solucion === 'cliente_actualiza') {
          estadoId = estadoPendiente.ses_id;
          comentario =
            'Solicitud rechazada en Auxiliar Servicio Cliente - Cliente debe actualizar';
        } else if (modo_solucion === 'auxiliar_actualiza') {
          estadoId = estadoRevision.ses_id;
          comentario =
            'Solicitud rechazada en Auxiliar Servicio Cliente - Auxiliar debe actualizar';
        } else {
          estadoId = estadoPendiente.ses_id;
          comentario = 'Solicitud rechazada en Auxiliar Servicio Cliente';
        }
      }

      const [resultadoWorkflow] = await queryRunner.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = @0`,
        [resultadoCodigo],
      );

      if (!etapaSAC || !resultadoWorkflow) {
        throw new Error(
          'No se encontraron configuraciones de workflow requeridas.',
        );
      }

      // Obtener datos del cliente para enviar correo ANTES de hacer el commit
      let clienteEmail: string | null = null;
      let numeroSolicitud: string | null = null;
      let nombreCliente: string | null = null;

      if (!aprobado) {
        const [solicitudData] = await queryRunner.query(
          `SELECT s.sol_numero_solicitud, c.cli_correo, c.cli_razon_social
           FROM solicitudes s
           LEFT JOIN clientes c ON s.sol_cliente_id = c.cli_id
           WHERE s.sol_id = @0`,
          [solicitudId],
        );
        if (solicitudData) {
          clienteEmail = solicitudData.cli_correo;
          numeroSolicitud = solicitudData.sol_numero_solicitud;
          nombreCliente = solicitudData.cli_razon_social;
        }
      }

      const motivoValue = aprobado ? 'NULL' : motivo_rechazo_id;
      const fechaEstimadaValue = fecha_estimada_respuesta_comercial
        ? `'${fecha_estimada_respuesta_comercial.toISOString().split('T')[0]}'`
        : 'NULL';
      const usuarioModificaValue = usuario_modifica ?? 'NULL';

      await queryRunner.query(`
        UPDATE solicitudes SET
          sol_estado_id = ${estadoId},
          sol_etapa_actual_id = ${etapaDestId},
          sol_resultado_etapa_id = ${resultadoWorkflow.wee_id},
          sol_motivo_rechazo_id = ${motivoValue},
          sol_fecha_estimada_respuesta_comercial = ${fechaEstimadaValue},
          sol_fecha_real_auxiliar_servicio_cliente = GETDATE(),
          sol_usuario_modifica = ${usuarioModificaValue},
          sol_updated_at = GETDATE()
        WHERE sol_id = ${solicitudId}
      `);

      // Registrar en historial de estados
      await queryRunner.query(`
        INSERT INTO Solicitudes_estados_hist
        (${histCols.solicitud_col}, ${histCols.estado_col}, ${histCols.usuario_col}, ${histCols.fecha_col})
        VALUES (${solicitudId}, ${estadoId}, ${usuarioModificaValue}, GETDATE())
      `);

      // Registrar transición en workflow historial (etapa ASC con su resultado)
      await queryRunner.query(
        `INSERT INTO solicitud_workflow_historial
         (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario)
         VALUES (@0, @1, @2, @3, @4)`,
        [
          solicitudId,
          etapaSAC.wet_id,
          resultadoWorkflow.wee_id,
          usuario_modifica || 1,
          comentario,
        ],
      );

      await queryRunner.commitTransaction();

      // Copiar archivos a directorio de cliente si se aprobó
      if (aprobado) {
        try {
          const [solicitudData] = await this.dataSource.query(
            `SELECT sol_nit_documento, sol_numero_solicitud, sol_co_id FROM solicitudes WHERE sol_id = @0`,
            [solicitudId],
          );
          if (solicitudData) {
            const { sol_nit_documento, sol_numero_solicitud, sol_co_id } =
              solicitudData;
            await this.copiarArchivosAlClienteDirectorio(
              solicitudId,
              sol_co_id,
              sol_nit_documento,
              sol_numero_solicitud,
            );
          }
        } catch (copyError) {
          console.warn(
            `⚠️ [aprobarRechazarSolicitud] Error copiando archivos:`,
            copyError,
          );
          // No lanzar error si la copia falla
        }
      }

      // Enviar correo al cliente si la solicitud fue rechazada
      if (!aprobado && clienteEmail) {
        try {
          await this.mailService.enviarCorreo({
            to: clienteEmail,
            subject: `Solicitud ${numeroSolicitud} - Requiere corrección de documentos`,
            html: `
              <h2>Solicitud Rechazada</h2>
              <p>Estimado ${nombreCliente},</p>
              <p>Su solicitud <strong>${numeroSolicitud}</strong> ha sido rechazada.</p>
              <p><strong>Acción requerida:</strong> Corrija los documentos</p>
              <p>Por favor, revise los documentos e intente nuevamente.</p>
              <br/>
              <p>Si tiene alguna pregunta, contáctenos.</p>
            `,
          });
          console.log(
            '[aprobarRechazarSolicitud] Correo enviado a:',
            clienteEmail,
          );
        } catch (emailError) {
          console.warn(
            '[aprobarRechazarSolicitud] Error enviando correo:',
            emailError,
          );
          // No lanzar error si falla el correo, solo registrar el aviso
        }
      }

      return {
        success: true,
        message: aprobado
          ? 'Solicitud aprobada exitosamente'
          : 'Solicitud rechazada exitosamente',
        solicitud_id: solicitudId,
        estado: aprobado ? 'APROBADO' : 'RECHAZADO',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async generarPdfSolicitud(solicitudId: number): Promise<Buffer> {
    // Usar el servicio centralizado para obtener el formulario renderizable
    const formulario =
      await this.formularioRenderizableService.obtenerFormularioRenderizable(
        solicitudId,
      );

    // Agrupar preguntas por seccion_id
    const seccionesMap = new Map<number, any>();
    for (const pregunta of formulario.preguntas) {
      const seccionId = pregunta.seccion_id;
      if (!seccionesMap.has(seccionId)) {
        seccionesMap.set(seccionId, {
          seccion_id: seccionId,
          preguntas: [],
        });
      }
      // Solo agregar si es visible
      if (pregunta.es_visible) {
        seccionesMap.get(seccionId).preguntas.push(pregunta);
      }
    }

    // Obtener nombres y órdenes de secciones
    let secciones: any[] = [];
    if (seccionesMap.size > 0) {
      const seccionIds = Array.from(seccionesMap.keys());
      const placeholders = seccionIds.map((_, idx) => `@${idx}`).join(',');
      const seccionesInfo = await this.dataSource.query(
        `SELECT fs_id as seccion_id, fs_nombre as seccion_nombre, fs_orden as seccion_orden
         FROM Formulario_secciones
         WHERE fs_id IN (${placeholders})
         ORDER BY fs_orden`,
        seccionIds,
      );

      secciones = seccionesInfo.map((s: any) => ({
        seccion_id: s.seccion_id,
        seccion_nombre: s.seccion_nombre,
        seccion_orden: s.seccion_orden,
        preguntas: seccionesMap.get(s.seccion_id)?.preguntas || [],
      }));
    }

    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont('Helvetica');
    const helveticaBold = await pdfDoc.embedFont('Helvetica-Bold');

    const pageWidth = 595;
    const pageHeight = 842;
    const marginLeft = 40;
    const marginRight = 40;
    const contentWidth = pageWidth - marginLeft - marginRight;

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let yPos = pageHeight - 40;
    let pageNumber = 1;

    const drawBox = (
      x: number,
      y: number,
      width: number,
      height: number,
      fillColor: any = null,
      borderColor: any = rgb(0.8, 0.8, 0.8),
    ) => {
      if (fillColor) {
        currentPage.drawRectangle({
          x,
          y: y - height,
          width,
          height,
          color: fillColor,
        });
      }
      currentPage.drawRectangle({
        x,
        y: y - height,
        width,
        height,
        borderColor,
        borderWidth: 1,
      });
    };

    const wrapText = (
      text: string,
      maxWidth: number,
      fontSize: number,
    ): string[] => {
      const charsPerLine = Math.floor(maxWidth / (fontSize * 0.5));
      const lines: string[] = [];
      const words = String(text).split(' ');
      let currentLine = '';

      for (const word of words) {
        if ((currentLine + word).length > charsPerLine) {
          if (currentLine) lines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine += (currentLine ? ' ' : '') + word;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      return lines;
    };

    // ===== HEADER MEJORADO =====
    // Fondo header principal
    drawBox(
      marginLeft - 10,
      yPos + 10,
      contentWidth + 20,
      70,
      rgb(0, 0.239, 0.6),
      rgb(0, 0.239, 0.6),
    );

    // Línea decorativa azul más clara arriba
    currentPage.drawRectangle({
      x: marginLeft - 10,
      y: yPos + 10,
      width: contentWidth + 20,
      height: 3,
      color: rgb(0, 0.322, 0.8),
    });

    const titleText = `${formulario.formulario_nombre} - v${formulario.formulario_version}`;
    const titleWidth = helveticaBold.widthOfTextAtSize(titleText, 20);
    currentPage.drawText(titleText, {
      x: marginLeft + (contentWidth - titleWidth) / 2,
      y: yPos - 8,
      size: 20,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });

    const subtitleText = 'Solicitud de Vinculación Comercial';
    const subtitleWidth = helvetica.widthOfTextAtSize(subtitleText, 10);
    currentPage.drawText(subtitleText, {
      x: marginLeft + (contentWidth - subtitleWidth) / 2,
      y: yPos - 28,
      size: 10,
      font: helvetica,
      color: rgb(0.95, 0.95, 0.95),
    });

    yPos -= 80;

    // ===== INFORMACIÓN DEL CLIENTE (PANEL) =====
    const infoBoxHeight = 70;
    drawBox(marginLeft, yPos, contentWidth, infoBoxHeight, rgb(0.93, 0.96, 1));

    const infoTituloText = 'INFORMACIÓN DE LA SOLICITUD';
    const infoTituloWidth = helveticaBold.widthOfTextAtSize(infoTituloText, 9);
    currentPage.drawText(infoTituloText, {
      x: marginLeft + (contentWidth - infoTituloWidth) / 2,
      y: yPos - 12,
      size: 9,
      font: helveticaBold,
      color: rgb(0, 0.239, 0.6),
    });

    const col1Width = contentWidth / 3;
    const col2Width = contentWidth / 3;
    const col3Width = contentWidth / 3;

    const drawCentered = (
      text: string,
      colX: number,
      colWidth: number,
      y: number,
      size: number,
      font: any,
      color: any,
    ) => {
      const textWidth = font.widthOfTextAtSize(text, size);
      currentPage.drawText(text, {
        x: colX + (colWidth - textWidth) / 2,
        y,
        size,
        font,
        color,
      });
    };

    const col1X = marginLeft;
    const col2X = marginLeft + col1Width;
    const col3X = marginLeft + col1Width + col2Width;
    const labelColor = rgb(0.4, 0.4, 0.4);
    const valueColor = rgb(0, 0, 0);

    // Columna 1
    drawCentered('N° Solicitud', col1X, col1Width, yPos - 28, 8, helvetica, labelColor);
    drawCentered(
      formulario.sol_numero_solicitud || 'N/A',
      col1X,
      col1Width,
      yPos - 38,
      10,
      helveticaBold,
      valueColor,
    );

    // Columna 2
    drawCentered('Cliente', col2X, col2Width, yPos - 28, 8, helvetica, labelColor);
    const clientLines = wrapText(
      formulario.cliente_nombre || 'N/A',
      col2Width - 16,
      9,
    );
    drawCentered(
      clientLines[0] || '',
      col2X,
      col2Width,
      yPos - 38,
      10,
      helveticaBold,
      valueColor,
    );

    // Columna 3
    drawCentered(
      'Centro de Operación',
      col3X,
      col3Width,
      yPos - 28,
      8,
      helvetica,
      labelColor,
    );
    drawCentered(
      formulario.centro_operacion_nombre || 'N/A',
      col3X,
      col3Width,
      yPos - 38,
      10,
      helveticaBold,
      valueColor,
    );

    yPos -= infoBoxHeight + 15;

    // ===== TABLA DE SECCIONES =====
    for (const seccion of secciones) {
      // Título de sección
      drawBox(
        marginLeft,
        yPos,
        contentWidth,
        18,
        rgb(0, 0.239, 0.6),
        rgb(0, 0.239, 0.6),
      );
      const seccionNombreWidth = helveticaBold.widthOfTextAtSize(
        seccion.seccion_nombre,
        11,
      );
      currentPage.drawText(seccion.seccion_nombre, {
        x: marginLeft + (contentWidth - seccionNombreWidth) / 2,
        y: yPos - 13,
        size: 11,
        font: helveticaBold,
        color: rgb(1, 1, 1),
      });
      yPos -= 18;

      yPos -= 15;

      // Separar preguntas NOTA, TABLA (con filas), IMAGEN (con archivo) y preguntas normales
      const notaPreguntas: any[] = [];
      const tablaPreguntas: any[] = [];
      const imagenPreguntas: any[] = [];
      const normalPreguntas: any[] = [];
      for (const preg of seccion.preguntas) {
        if (preg.fp_tipo === 'NOTA') {
          notaPreguntas.push(preg);
        } else if (
          preg.fp_tipo === 'TABLA' &&
          Array.isArray(preg.tabla_columnas) &&
          preg.tabla_columnas.length > 0 &&
          Array.isArray(preg.tabla_filas) &&
          preg.tabla_filas.length > 0
        ) {
          tablaPreguntas.push(preg);
        } else if (preg.fp_tipo === 'IMAGEN' && preg.imagen_ruta) {
          imagenPreguntas.push(preg);
        } else {
          normalPreguntas.push(preg);
        }
      }

      // Renderizar NOTAS a ancho completo primero
      for (const notaPregunta of notaPreguntas) {
        const notaText = String(notaPregunta.fp_descripcion);
        const notaLines = wrapText(notaText, contentWidth - 12, 8);

        const notaBoxHeight = notaLines.length * 9 + 10;

        // Caja para la nota
        drawBox(
          marginLeft,
          yPos,
          contentWidth,
          notaBoxHeight,
          rgb(0.93, 0.96, 1),
          rgb(0.75, 0.83, 0.92),
        );

        let currentY = yPos - 8;
        for (const line of notaLines) {
          currentPage.drawText(line, {
            x: marginLeft + 8,
            y: currentY,
            size: 8,
            font: helvetica,
            color: rgb(0.3, 0.3, 0.3),
          });
          currentY -= 9;
        }

        yPos -= notaBoxHeight + 8;

        // Nueva página si es necesario
        if (yPos < 100) {
          currentPage.drawText(`Página ${pageNumber}`, {
            x: pageWidth / 2 - 20,
            y: 20,
            size: 8,
            font: helvetica,
            color: rgb(0.6, 0.6, 0.6),
          });

          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          yPos = pageHeight - 40;
        }
      }

      // Renderizar preguntas TABLA como grillas reales (una fila = un registro)
      for (const tablaPregunta of tablaPreguntas) {
        const columnas: string[] = tablaPregunta.tabla_columnas;
        const filas: Record<string, string>[] = tablaPregunta.tabla_filas;
        const numCols = columnas.length;
        const colWidth = contentWidth / numCols;
        const cellPaddingX = 4;
        const fontSize = 7;

        // Título de la pregunta
        const tituloLines = wrapText(
          String(tablaPregunta.fp_descripcion),
          contentWidth,
          9,
        );
        for (const line of tituloLines) {
          if (yPos < 100) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            yPos = pageHeight - 40;
          }
          currentPage.drawText(line, {
            x: marginLeft,
            y: yPos,
            size: 9,
            font: helveticaBold,
            color: rgb(0, 0.239, 0.6),
          });
          yPos -= 11;
        }
        yPos -= 3;

        // Pre-calcular líneas envueltas por celda para saber la altura de cada fila
        const filasConLineas = filas.map((fila) =>
          columnas.map((columna) =>
            wrapText(String(fila[columna] ?? ''), colWidth - cellPaddingX * 2, fontSize),
          ),
        );

        const dibujarEncabezado = () => {
          if (yPos < 100) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            yPos = pageHeight - 40;
          }
          const headerHeight = 14;
          drawBox(
            marginLeft,
            yPos,
            contentWidth,
            headerHeight,
            rgb(0, 0.239, 0.6),
            rgb(0, 0.239, 0.6),
          );
          columnas.forEach((columna, idx) => {
            currentPage.drawText(columna, {
              x: marginLeft + idx * colWidth + cellPaddingX,
              y: yPos - 10,
              size: fontSize,
              font: helveticaBold,
              color: rgb(1, 1, 1),
            });
          });
          yPos -= headerHeight;
        };

        dibujarEncabezado();

        filasConLineas.forEach((lineasFila) => {
          const maxLineas = Math.max(...lineasFila.map((l) => l.length), 1);
          const rowHeight = maxLineas * 9 + 6;

          // Nueva página si la fila no cabe; repetir encabezado
          if (yPos - rowHeight < 100) {
            currentPage.drawText(`Página ${pageNumber}`, {
              x: pageWidth / 2 - 20,
              y: 20,
              size: 8,
              font: helvetica,
              color: rgb(0.6, 0.6, 0.6),
            });
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            yPos = pageHeight - 40;
            dibujarEncabezado();
          }

          drawBox(marginLeft, yPos, contentWidth, rowHeight);
          columnas.forEach((_, idx) => {
            if (idx > 0) {
              currentPage.drawLine({
                start: { x: marginLeft + idx * colWidth, y: yPos },
                end: { x: marginLeft + idx * colWidth, y: yPos - rowHeight },
                thickness: 1,
                color: rgb(0.8, 0.8, 0.8),
              });
            }
            const lineas = lineasFila[idx];
            let cellY = yPos - 9;
            for (const linea of lineas) {
              currentPage.drawText(linea, {
                x: marginLeft + idx * colWidth + cellPaddingX,
                y: cellY,
                size: fontSize,
                font: helvetica,
                color: rgb(0.2, 0.2, 0.2),
              });
              cellY -= 9;
            }
          });

          yPos -= rowHeight;
        });

        yPos -= 10;
      }

      // Renderizar preguntas IMAGEN embebiendo la imagen real en el PDF
      for (const imagenPregunta of imagenPreguntas) {
        const tituloLines = wrapText(
          String(imagenPregunta.fp_descripcion),
          contentWidth,
          9,
        );
        for (const line of tituloLines) {
          if (yPos < 100) {
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            yPos = pageHeight - 40;
          }
          currentPage.drawText(line, {
            x: marginLeft,
            y: yPos,
            size: 9,
            font: helveticaBold,
            color: rgb(0, 0.239, 0.6),
          });
          yPos -= 11;
        }
        yPos -= 3;

        try {
          const bytes = await readFile(imagenPregunta.imagen_ruta);
          const esPng = /png/i.test(imagenPregunta.imagen_tipo_mime || '');
          const embeddedImage = esPng
            ? await pdfDoc.embedPng(bytes)
            : await pdfDoc.embedJpg(bytes);

          const maxWidth = Math.min(contentWidth, 220);
          const maxHeight = 160;
          const scale = Math.min(
            maxWidth / embeddedImage.width,
            maxHeight / embeddedImage.height,
            1,
          );
          const imgWidth = embeddedImage.width * scale;
          const imgHeight = embeddedImage.height * scale;

          if (yPos - imgHeight < 100) {
            currentPage.drawText(`Página ${pageNumber}`, {
              x: pageWidth / 2 - 20,
              y: 20,
              size: 8,
              font: helvetica,
              color: rgb(0.6, 0.6, 0.6),
            });
            currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            yPos = pageHeight - 40;
          }

          currentPage.drawImage(embeddedImage, {
            x: marginLeft,
            y: yPos - imgHeight,
            width: imgWidth,
            height: imgHeight,
          });
          yPos -= imgHeight + 12;
        } catch (err) {
          console.error(
            `❌ Error embebiendo imagen para pregunta ${imagenPregunta.fp_id}:`,
            err,
          );
          currentPage.drawText('(No se pudo cargar la imagen)', {
            x: marginLeft,
            y: yPos,
            size: 8,
            font: helvetica,
            color: rgb(0.6, 0.2, 0.2),
          });
          yPos -= 14;
        }
      }

      // Organizar preguntas NORMALES en 3 columnas - ALTURA DINÁMICA
      const columnWidth = contentWidth / 3;
      const preguntasArray = normalPreguntas;
      let preguntaIndex = 0;

      while (preguntaIndex < preguntasArray.length) {
        const rowStartY = yPos;
        const columnXPositions = [
          marginLeft,
          marginLeft + columnWidth,
          marginLeft + columnWidth * 2,
        ];

        // Calcular altura real de cada columna
        const columnHeights = [0, 0, 0];
        for (let col = 0; col < 3; col++) {
          if (preguntaIndex + col >= preguntasArray.length) continue;

          const pregunta = preguntasArray[preguntaIndex + col];
          const preguntaText = String(pregunta.fp_descripcion);
          const maxColWidth = columnWidth - 12;

          // Preguntas normales: mostrar pregunta + respuesta
          const respuestaText = String(
            pregunta.valor_resuelto || 'Sin respuesta',
          );
          const preguntaLines = wrapText(preguntaText + ':', maxColWidth, 8);
          const respuestaLines = wrapText(respuestaText, maxColWidth, 8);

          // Si pregunta cabe en 1 línea y respuesta también, revisar si caben juntas
          let totalHeight = 10;
          if (preguntaLines.length === 1 && respuestaText.length < 30) {
            totalHeight = 10;
          } else {
            totalHeight =
              preguntaLines.length * 9 + respuestaLines.length * 9 + 8;
          }

          columnHeights[col] = totalHeight;
        }

        const maxHeightInRow = Math.max(...columnHeights, 15);

        // Procesar hasta 3 columnas
        for (let col = 0; col < 3; col++) {
          if (preguntaIndex >= preguntasArray.length) break;

          const pregunta = preguntasArray[preguntaIndex];
          const preguntaText = String(pregunta.fp_descripcion);

          const colX = columnXPositions[col];
          const maxColWidth = columnWidth - 12;

          let currentY = rowStartY;

          // PREGUNTAS NORMALES: mostrar pregunta + respuesta
          const respuestaText = String(
            pregunta.valor_resuelto || 'Sin respuesta',
          );
          const preguntaLines = wrapText(preguntaText + ':', maxColWidth, 8);
          const respuestaLines = wrapText(respuestaText, maxColWidth, 8);

          // Si pregunta cabe en 1 línea y respuesta es corta, intentar poner juntas
          if (
            preguntaLines.length === 1 &&
            respuestaText.length < 30 &&
            (preguntaLines[0].length + respuestaText.length) * 4.5 < maxColWidth
          ) {
            // Caben en la misma línea
            currentPage.drawText(preguntaLines[0], {
              x: colX,
              y: currentY,
              size: 8,
              font: helveticaBold,
              color: rgb(0, 0.239, 0.6),
            });

            currentPage.drawText(respuestaText, {
              x: colX + preguntaLines[0].length * 4.5 + 2,
              y: currentY,
              size: 8,
              font: helvetica,
              color: rgb(0.2, 0.2, 0.2),
            });
          } else {
            // Mostrar pregunta (puede ser varias líneas)
            for (let i = 0; i < preguntaLines.length; i++) {
              currentPage.drawText(preguntaLines[i], {
                x: colX,
                y: currentY,
                size: 8,
                font: helveticaBold,
                color: rgb(0, 0.239, 0.6),
              });
              currentY -= 9;
            }

            currentY -= 2; // Pequeña separación

            // Mostrar respuesta (puede ser varias líneas)
            for (let i = 0; i < respuestaLines.length; i++) {
              currentPage.drawText(respuestaLines[i], {
                x: colX,
                y: currentY,
                size: 8,
                font: helvetica,
                color: rgb(0.2, 0.2, 0.2),
              });
              currentY -= 9;
            }
          }

          preguntaIndex++;
        }

        yPos -= maxHeightInRow + 12;

        // Nueva página si es necesario
        if (yPos < 100) {
          // Footer
          currentPage.drawText(`Página ${pageNumber}`, {
            x: pageWidth / 2 - 20,
            y: 20,
            size: 8,
            font: helvetica,
            color: rgb(0.6, 0.6, 0.6),
          });

          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          yPos = pageHeight - 40;
        }
      }

      yPos -= 8;
    }

    // ===== FOOTER FINAL =====
    currentPage.drawText(
      `Documento generado: ${new Date().toLocaleDateString('es-CO')}`,
      {
        x: marginLeft,
        y: 30,
        size: 8,
        font: helvetica,
        color: rgb(0.6, 0.6, 0.6),
      },
    );

    currentPage.drawText(`Página ${pageNumber}`, {
      x: pageWidth / 2 - 20,
      y: 30,
      size: 8,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  async getDiasRespuesta(): Promise<ParamDiasRespuestaResponseDto[]> {
    console.log('📡 [getDiasRespuesta] Consultando base de datos');
    try {
      const dias = await this.dataSource.query(
        `SELECT pdr_id AS id, pdr_area AS area, pdr_dias AS dias FROM param_dias_respuesta_solicitudes WHERE pdr_estado = 1 ORDER BY pdr_id`,
      );
      console.log('📡 [getDiasRespuesta] Resultados:', dias);
      return dias;
    } catch (error) {
      console.error(
        '❌ [getDiasRespuesta] Error obteniendo días de respuesta:',
        error,
      );
      throw error;
    }
  }

  async getEtapas(): Promise<WorkflowEtapaResponseDto[]> {
    try {
      const etapas = await this.dataSource.query(
        `SELECT wet_id AS id, wet_nombre AS nombre FROM workflow_etapas WHERE wet_activo = 1 ORDER BY wet_orden`,
      );
      return etapas;
    } catch (error) {
      console.error('[getEtapas] Error:', error);
      return [];
    }
  }

  async getResultados(): Promise<WorkflowResultadoResponseDto[]> {
    try {
      const resultados = await this.dataSource.query(
        `SELECT wee_id AS id, wee_nombre AS nombre FROM workflow_estado_etapa WHERE wee_activo = 1 ORDER BY wee_id`,
      );
      return resultados;
    } catch (error) {
      console.error('[getResultados] Error:', error);
      return [];
    }
  }

  private formatCurrency(value?: number | null): string {
    if (!value) return '-';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  private async obtenerSiguienteNumeroSolicitud(
    copId: number,
    queryRunner?: any,
  ): Promise<string> {
    const runner = queryRunner || this.dataSource.createQueryRunner();
    const ownRunner = !queryRunner;

    try {
      const result = await runner.query(
        `DECLARE @numero_solicitud INT;
         EXEC sp_ObtenerSiguienteNumeroSolicitud @cop_id = @0, @numero_solicitud = @numero_solicitud OUTPUT;
         SELECT @numero_solicitud as numero_solicitud;`,
        [copId],
      );

      if (result && result.length > 0) {
        return String(result[0].numero_solicitud);
      }

      throw new Error('No se pudo generar el número de solicitud');
    } finally {
      if (ownRunner) {
        await runner.release();
      }
    }
  }

  private async copiarArchivosAlClienteDirectorio(
    solicitud_id: number,
    centro_id: number,
    nit_cliente: string,
    numero_solicitud: string,
  ) {
    try {
      // Obtener nombre del centro
      const centroResult = await this.dataSource.query(
        `SELECT cop_nombre FROM Centro_operacion WHERE cop_id = @0`,
        [centro_id],
      );
      if (!centroResult || centroResult.length === 0) {
        console.warn(`⚠️ Centro ${centro_id} no encontrado`);
        return;
      }

      const cop_nombre = centroResult[0].cop_nombre;

      // Rutas origen (formularios) y destino (clientes)
      const directorioOrigen = join(
        process.cwd(),
        'Documentos-Solicitudes',
        cop_nombre,
        'formularios',
        numero_solicitud,
      );

      const directorioDestino = join(
        process.cwd(),
        'Documentos-Solicitudes',
        cop_nombre,
        'clientes',
        nit_cliente,
      );

      // Verificar si existe el directorio de origen
      try {
        await stat(directorioOrigen);
      } catch {
        console.warn(
          `⚠️ Directorio de formularios no existe: ${directorioOrigen}`,
        );
        return;
      }

      // Crear directorio destino si no existe
      await mkdir(directorioDestino, { recursive: true });

      // Copiar archivos
      await cp(directorioOrigen, directorioDestino, { recursive: true });

      console.log(
        `✅ [copiarArchivosAlClienteDirectorio] Archivos copiados de ${directorioOrigen} a ${directorioDestino}`,
      );
    } catch (error) {
      console.error(
        `❌ [copiarArchivosAlClienteDirectorio] Error copiando archivos:`,
        error,
      );
      // No fallar el flujo si la copia falla
    }
  }
}
