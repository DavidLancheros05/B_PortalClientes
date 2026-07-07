// src/solicitudes/solicitudes-workflow.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { cp } from 'fs/promises';
import { join } from 'path';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { MailService } from '../mail/mail.service';
import { WorkflowService } from './workflow.service';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';

@Injectable()
export class SolicitudesWorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesService: NotificacionesService,
    private readonly mailService: MailService,
    private readonly workflowService: WorkflowService,
    private readonly historialWorkflowService: HistorialWorkflowService,
  ) {}

  private async resolveLookupColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('clientes','cli_id') IS NOT NULL THEN 'cli_id' ELSE 'cliente_id' END AS cli_id,
        CASE WHEN COL_LENGTH('clientes','cli_razon_social') IS NOT NULL THEN 'cli_razon_social' ELSE 'cliente_razon_social' END AS cli_razon_social
    `);
    const row = result[0] ?? {};
    return {
      cliId: String(row.cli_id ?? 'cliente_id').trim(),
      cliRazonSocial: String(
        row.cli_razon_social ?? 'cliente_razon_social',
      ).trim(),
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

  async guardarGestionEjecutivo(
    solicitud_id: number,
    consumo_mensual_proyectado: number | null,
    observacionesComercial?: string,
    usuario_modifica?: number,
    fecha_real_ejecutivo?: string,
  ) {
    console.log(
      `💾 [guardarGestionEjecutivo] Guardando concepto para solicitud ${solicitud_id}`,
    );

    try {
      const etapaSAC = await this.workflowService.obtenerEtapaPorCodigo('ASC');
      const resultadoPD =
        await this.workflowService.obtenerResultadoPorCodigo('PENDIENTE');

      if (!etapaSAC || !resultadoPD) {
        throw new Error(
          'No se encontraron las configuraciones de workflow ASC o Resultado PENDIENTE',
        );
      }

      const estadoRevision = await this.dataSource.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'REVISION'`,
      );
      const estadoRevisionId = estadoRevision?.[0]?.ses_id;

      const resultado = await this.workflowService.cambiarEtapa(
        solicitud_id,
        etapaSAC.wet_id,
        resultadoPD.wee_id,
        usuario_modifica,
        `Concepto ejecutivo registrado: Consumo $${consumo_mensual_proyectado}`,
      );

      const updateParams: any[] = [
        consumo_mensual_proyectado,
        observacionesComercial,
        estadoRevisionId,
        usuario_modifica,
        solicitud_id,
      ];
      let updateSQL = `UPDATE solicitudes SET sol_consumo_mensual_proyectado = @0, sol_observacion_ejn = @1, sol_estado_id = @2, sol_usuario_modifica = @3, sol_updated_at = GETDATE()`;

      if (fecha_real_ejecutivo) {
        updateSQL += `, sol_fecha_real_ejecutivo = @5`;
        updateParams.push(fecha_real_ejecutivo);
      } else {
        updateSQL += `, sol_fecha_real_ejecutivo = GETDATE()`;
      }

      updateSQL += ` WHERE sol_id = @4`;

      await this.dataSource.query(updateSQL, updateParams);

      return {
        success: true,
        solicitud_id,
        mensaje: 'Concepto ejecutivo registrado exitosamente',
        workflow: resultado,
      };
    } catch (error) {
      console.error(`❌ [guardarGestionEjecutivo] Error:`, error);
      throw error;
    }
  }

  async guardarConceptoGenerico(
    solicitud_id: number,
    etapa_codigo_siguiente: string | null,
    comentario: string,
    usuario_modifica: number,
    aprobado: boolean = true,
    motivo_rechazo_id?: number | null,
    condiciones?: {
      cupo?: number;
      plazoPago?: number;
      formaPago?: string;
    },
  ) {
    console.log(
      `💾 [guardarConceptoGenerico] Solicitud ${solicitud_id}, siguiente: ${etapa_codigo_siguiente}, aprobado: ${aprobado}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [solicitudActual] = await queryRunner.query(
        `SELECT s.sol_etapa_actual_id, we.wet_codigo
         FROM solicitudes s
         LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_etapa_actual_id
         WHERE s.sol_id = @0`,
        [solicitud_id],
      );
      const etapaActualId = solicitudActual?.sol_etapa_actual_id;
      const etapaActualCodigo = solicitudActual?.wet_codigo;

      const [estadoRevision] = await queryRunner.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'REVISION'`,
      );
      const [estadoAprobada] = await queryRunner.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'APROBADA'`,
      );
      const [estadoRechazada] = await queryRunner.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'RECHAZADA'`,
      );

      let etapaDestId: number;
      let estadoId: number;
      let resultadoCodigo: string;

      if (!aprobado) {
        etapaDestId = etapaActualId;
        estadoId = estadoRechazada.ses_id;
        resultadoCodigo = 'RECHAZADO';
      } else if (etapa_codigo_siguiente) {
        const [etapaSiguiente] = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = @0`,
          [etapa_codigo_siguiente],
        );
        etapaDestId = etapaSiguiente.wet_id;
        estadoId = estadoRevision.ses_id;
        resultadoCodigo = 'PENDIENTE';
      } else {
        etapaDestId = etapaActualId;
        estadoId = estadoAprobada.ses_id;
        resultadoCodigo = 'APROBADO';
      }

      const [resultadoWorkflow] = await queryRunner.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = @0`,
        [resultadoCodigo],
      );

      const fechaColumna: Record<string, string> = {
        EJN: 'sol_fecha_real_ejecutivo',
        ASC: 'sol_fecha_real_auxiliar_servicio_cliente',
        OFC: 'sol_fecha_real_oficial_cumplimiento',
        CC1: 'sol_fecha_real_comite_credito_1',
        CC2: 'sol_fecha_real_comite_credito_2',
      };
      const columnaFecha =
        etapaActualCodigo && fechaColumna[etapaActualCodigo]
          ? `, ${fechaColumna[etapaActualCodigo]} = GETDATE()`
          : '';

      const params: any[] = [
        estadoId,
        etapaDestId,
        resultadoWorkflow.wee_id,
        usuario_modifica,
        solicitud_id,
      ];
      let updateSQL = `UPDATE solicitudes SET
        sol_estado_id = @0,
        sol_etapa_actual_id = @1,
        sol_resultado_etapa_id = @2,
        sol_usuario_modifica = @3,
        sol_updated_at = GETDATE()
        ${columnaFecha}`;

      if (!aprobado && motivo_rechazo_id) {
        updateSQL += `, sol_motivo_rechazo_id = @5`;
        params.push(motivo_rechazo_id);
      }

      if (aprobado && condiciones && etapaActualCodigo === 'CC2') {
        let paramIndex = params.length;
        if (condiciones.cupo !== undefined) {
          updateSQL += `, sol_cupo_aprobado = @${paramIndex}`;
          params.push(condiciones.cupo);
          paramIndex++;
        }
        if (condiciones.plazoPago !== undefined) {
          updateSQL += `, sol_plazo_pago = @${paramIndex}`;
          params.push(condiciones.plazoPago);
          paramIndex++;
        }
        if (condiciones.formaPago) {
          updateSQL += `, sol_forma_pago = @${paramIndex}`;
          params.push(condiciones.formaPago);
          paramIndex++;
        }
        if (usuario_modifica) {
          updateSQL += `, sol_usuario_aprueba_condiciones = @${paramIndex}`;
          params.push(usuario_modifica);
        }
      }

      updateSQL += ` WHERE sol_id = @4`;

      try {
        await queryRunner.query(updateSQL, params);
      } catch (updateError: any) {
        if (updateError.number === 207) {
          console.warn(
            '[guardarConceptoGenerico] Columnas de condiciones no existen aún. Guardando solo decisión.',
          );
          const basicUpdateSQL = `UPDATE solicitudes SET
            sol_estado_id = @0,
            sol_etapa_actual_id = @1,
            sol_resultado_etapa_id = @2,
            sol_usuario_modifica = @3,
            sol_updated_at = GETDATE()
            ${columnaFecha}`;

          if (!aprobado && motivo_rechazo_id) {
            const basicParams = [
              estadoId,
              etapaDestId,
              resultadoWorkflow.wee_id,
              usuario_modifica,
              solicitud_id,
              motivo_rechazo_id,
            ];
            await queryRunner.query(
              basicUpdateSQL + `, sol_motivo_rechazo_id = @5 WHERE sol_id = @4`,
              basicParams,
            );
          } else {
            const basicParams = [
              estadoId,
              etapaDestId,
              resultadoWorkflow.wee_id,
              usuario_modifica,
              solicitud_id,
            ];
            await queryRunner.query(
              basicUpdateSQL + ` WHERE sol_id = @4`,
              basicParams,
            );
          }
        } else {
          throw updateError;
        }
      }

      const mensajeHistorial = aprobado
        ? `Aprobado en etapa ${etapaActualCodigo}`
        : `Rechazado en etapa ${etapaActualCodigo}`;

      await queryRunner.query(
        `INSERT INTO solicitud_workflow_historial
         (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario)
         VALUES (@0, @1, @2, @3, @4)`,
        [
          solicitud_id,
          etapaActualId,
          resultadoWorkflow.wee_id,
          usuario_modifica,
          comentario || mensajeHistorial,
        ],
      );

      await queryRunner.commitTransaction();

      if (aprobado && etapaActualCodigo === 'ASC') {
        try {
          const solicitudData = await this.dataSource.query(
            `SELECT sol_nit_documento, sol_numero_solicitud, sol_co_id FROM solicitudes WHERE sol_id = @0`,
            [solicitud_id],
          );
          if (solicitudData && solicitudData.length > 0) {
            const { sol_nit_documento, sol_numero_solicitud, sol_co_id } =
              solicitudData[0];
            await this.copiarArchivosAlClienteDirectorio(
              solicitud_id,
              sol_co_id,
              sol_nit_documento,
              sol_numero_solicitud,
            );
          }
        } catch (copyError) {
          console.error(
            `⚠️ [guardarConceptoGenerico] Error copiando archivos:`,
            copyError,
          );
        }
      }

      if (aprobado && etapaActualCodigo === 'CC2') {
        try {
          await this.enviarCartaVinculacionPorCorreo(solicitud_id, condiciones);
        } catch (emailError) {
          console.error(
            `⚠️ [guardarConceptoGenerico] Error enviando correo:`,
            emailError,
          );
        }
      }

      return {
        success: true,
        solicitud_id,
        mensaje: 'Concepto registrado exitosamente',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`❌ [guardarConceptoGenerico] Error:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async actualizarEstadoFlujoAutomatico(
    solicitud_id: number,
    estadoCodigo: string,
    etapaCodigo: string,
    resultadoCodigo: string,
    usuario_modifica: number,
  ) {
    try {
      const [estadoResult] = await this.dataSource.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = @0`,
        [estadoCodigo],
      );
      const [etapaResult] = await this.dataSource.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = @0`,
        [etapaCodigo],
      );
      const [resultadoResult] = await this.dataSource.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = @0`,
        [resultadoCodigo],
      );

      if (!estadoResult || !etapaResult || !resultadoResult) {
        throw new Error(
          `No se encontraron configuraciones: estado=${estadoCodigo}, etapa=${etapaCodigo}, resultado=${resultadoCodigo}`,
        );
      }

      return this.actualizarEstadoFlujo(
        solicitud_id,
        estadoResult.ses_id,
        etapaResult.wet_id,
        resultadoResult.wee_id,
        usuario_modifica,
      );
    } catch (error) {
      console.error(`❌ [actualizarEstadoFlujoAutomatico] Error:`, error);
      throw error;
    }
  }

  async actualizarEstadoFlujo(
    solicitud_id: number,
    estado_id: number,
    etapa_actual_id: number,
    resultado_etapa_id: number,
    usuario_modifica: number,
  ) {
    try {
      await this.dataSource.query(
        `UPDATE solicitudes SET
          sol_estado_id = @0,
          sol_etapa_actual_id = @1,
          sol_resultado_etapa_id = @2,
          sol_usuario_modifica = @3,
          sol_updated_at = GETDATE()
         WHERE sol_id = @4`,
        [
          estado_id,
          etapa_actual_id,
          resultado_etapa_id,
          usuario_modifica,
          solicitud_id,
        ],
      );

      return {
        success: true,
        solicitud_id,
        mensaje: 'Estado de flujo actualizado exitosamente',
      };
    } catch (error) {
      console.error(`❌ [actualizarEstadoFlujo] Error:`, error);
      throw error;
    }
  }

  async obtenerWorkflowHistorial(solicitudId: number) {
    try {
      const historial =
        await this.historialWorkflowService.obtenerHistorial(solicitudId);
      return {
        ok: true,
        solicitud_id: solicitudId,
        historial: historial.map((h) => ({
          historial_id: h.historialId,
          etapa_codigo: h.etapaCodigo,
          etapa_nombre: h.etapaNombre,
          resultado_codigo: h.resultadoCodigo,
          resultado_nombre: h.resultadoNombre,
          nombre: h.usuarioNombre || h.usuarioCorreo,
          usuario_id: h.usuarioId,
          comentario: h.comentario,
          fecha: h.fecha,
        })),
      };
    } catch (error) {
      console.error('[obtenerWorkflowHistorial] Error:', error);
      throw new Error(
        `Error obteniendo historial de workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async actualizarResultadoPendiente(
    solicitudId: number,
    usuarioId: number = 1,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `UPDATE solicitudes
         SET sol_estado_id = @0,
             sol_etapa_actual_id = @1,
             sol_resultado_etapa_id = @2,
             sol_usuario_modifica = @3,
             sol_updated_at = GETDATE()
         WHERE sol_id = @4`,
        [3, 3, 1, usuarioId, solicitudId],
      );

      await queryRunner.query(
        `INSERT INTO solicitud_workflow_historial
         (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario, swh_fecha)
         VALUES (@0, @1, @2, @3, @4, GETDATE())`,
        [
          solicitudId,
          3,
          1,
          usuarioId,
          'Solicitud corregida por cliente - Resultado actualizado a PENDIENTE',
        ],
      );

      await queryRunner.commitTransaction();
      return { success: true, solicitudId, resultadoId: 1 };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`❌ [actualizarResultadoPendiente] Error:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async enviarCartaVinculacionPorCorreo(
    solicitud_id: number,
    condiciones?: {
      cupo?: number;
      plazoPago?: number;
      formaPago?: string;
    },
  ) {
    try {
      const lookup = await this.resolveLookupColumns();

      const [solicitud] = await this.dataSource.query(
        `SELECT
          s.sol_numero_solicitud,
          c.${lookup.cliId} AS cliente_id,
          c.${lookup.cliRazonSocial} AS cliente_nombre,
          c.cli_correo AS cliente_email,
          s.sol_cupo_aprobado,
          s.sol_plazo_pago,
          s.sol_forma_pago
        FROM solicitudes s
        LEFT JOIN clientes c ON c.${lookup.cliId} = s.sol_cliente_id
        WHERE s.sol_id = @0`,
        [solicitud_id],
      );

      if (!solicitud || !solicitud.cliente_email) {
        console.warn(
          `⚠️ [enviarCartaVinculacionPorCorreo] No se encontró cliente o email para solicitud ${solicitud_id}`,
        );
        return;
      }

      const [plantillaCartaPDF] = await this.dataSource.query(
        `SELECT TOP 1 cpv_contenido FROM param_carta_pdf_vinculacion
         WHERE cpv_activo = 1`,
      );

      if (!plantillaCartaPDF) {
        console.warn(
          `⚠️ [enviarCartaVinculacionPorCorreo] Plantilla de carta PDF no encontrada`,
        );
        return;
      }

      const [plantilla] = await this.dataSource.query(
        `SELECT asunto, cuerpo_html FROM Param_formato_correos_enviar
         WHERE codigo_evento = 'CARTA_VINCULACION_APROBADA_CLIENTE' AND activa = 1`,
      );

      if (!plantilla) {
        console.warn(
          `⚠️ [enviarCartaVinculacionPorCorreo] Plantilla de correo no encontrada`,
        );
        return;
      }

      let contenidoCarta = plantillaCartaPDF.cpv_contenido;
      const reemplazosCartaMap: Record<string, string> = {
        '{{cliente_nombre}}': solicitud.cliente_nombre || '-',
        '{{cupo_aprobado}}': this.formatCurrency(solicitud.sol_cupo_aprobado),
        '{{forma_pago}}': solicitud.sol_forma_pago || '-',
        '{{plazo}}': solicitud.sol_plazo_pago
          ? `${solicitud.sol_plazo_pago} días`
          : '-',
        '{{fecha_aprobacion}}': new Date().toLocaleDateString('es-CO'),
        '{{numero_solicitud}}': solicitud.sol_numero_solicitud || '-',
        '{{tasa_interes}}': '-',
      };

      Object.entries(reemplazosCartaMap).forEach(([placeholder, valor]) => {
        contenidoCarta = contenidoCarta.replace(
          new RegExp(placeholder, 'g'),
          valor,
        );
      });

      const pdfBuffer = await this.generarPDFCarta(
        contenidoCarta,
        solicitud.sol_numero_solicitud,
      );

      let asunto = plantilla.asunto;
      let cuerpoHtml = plantilla.cuerpo_html;

      const reemplazosCorreo: Record<string, string> = {
        '{{numero_solicitud}}': solicitud.sol_numero_solicitud || '-',
        '{{cliente_nombre}}': solicitud.cliente_nombre || '-',
        '{{cupo_aprobado}}': this.formatCurrency(solicitud.sol_cupo_aprobado),
        '{{plazo_pago}}': solicitud.sol_plazo_pago
          ? `${solicitud.sol_plazo_pago} días`
          : '-',
        '{{forma_pago}}': solicitud.sol_forma_pago || '-',
      };

      Object.entries(reemplazosCorreo).forEach(([placeholder, valor]) => {
        asunto = asunto.replace(new RegExp(placeholder, 'g'), valor);
        cuerpoHtml = cuerpoHtml.replace(new RegExp(placeholder, 'g'), valor);
      });

      await this.mailService.enviarCorreo({
        to: solicitud.cliente_email,
        subject: asunto,
        html: cuerpoHtml,
        attachments: [
          {
            filename: `carta-vinculacion-${solicitud.sol_numero_solicitud}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    } catch (error) {
      console.error(`❌ [enviarCartaVinculacionPorCorreo] Error:`, error);
      throw error;
    }
  }

  private async generarPDFCarta(
    contenidoCarta: string,
    numeroSolicitud: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const PDFDocument = require('pdfkit');
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          bufferPages: true,
        });

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text('Carta de Vinculación Comercial', { align: 'center' });
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(`Solicitud: ${numeroSolicitud}`, { align: 'center' });
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-CO')}`, {
          align: 'center',
        });
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown();

        doc.fontSize(12).font('Helvetica').text(contenidoCarta, {
          align: 'justify',
          lineGap: 5,
        });

        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown();

        doc
          .fontSize(10)
          .font('Helvetica')
          .text(
            `Documento generado automáticamente el ${new Date().toLocaleDateString('es-CO')}`,
            { align: 'center' },
          );
        doc.text('Sistema de Vinculación Comercial - CARTONERA', {
          align: 'center',
        });

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
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

  private async copiarArchivosAlClienteDirectorio(
    solicitudId: number,
    coId: number,
    nitDocumento: string,
    numeroSolicitud: string,
  ) {
    console.log(
      `[copiarArchivosAlClienteDirectorio] Copiando archivos: sol=${solicitudId}, co=${coId}, nit=${nitDocumento}, numero=${numeroSolicitud}`,
    );

    try {
      // Obtener ruta del centro
      const [centroData] = await this.dataSource.query(
        `SELECT cop_nombre FROM Centro_operacion WHERE cop_id = @0`,
        [coId],
      );
      if (!centroData) {
        throw new Error(`Centro ${coId} no encontrado`);
      }

      const centroNombre = centroData.cop_nombre;

      // Directorios fuente y destino
      const sourceDir = join(
        process.cwd(),
        'Documentos-Solicitudes',
        centroNombre,
        'formularios',
        numeroSolicitud,
      );
      const destDir = join(
        process.cwd(),
        'Documentos-Solicitudes',
        centroNombre,
        'clientes',
        nitDocumento,
      );

      console.log(`📁 Copiando de: ${sourceDir} → ${destDir}`);

      // Copiar archivos (crea destino si no existe)
      await cp(sourceDir, destDir, { recursive: true, force: true });
      console.log(`✅ Archivos copiados exitosamente`);
    } catch (error) {
      console.warn(
        `⚠️ Error copiando archivos para solicitud ${solicitudId}:`,
        error,
      );
      // No fallar la aprobación si falla la copia
    }
  }
}
