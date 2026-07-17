// src/solicitudes/solicitudes-workflow.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { MailService } from '../mail/mail.service';
import { WorkflowService } from './workflow.service';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../common/storage/storage.interface';

@Injectable()
export class SolicitudesWorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesService: NotificacionesService,
    private readonly mailService: MailService,
    private readonly workflowService: WorkflowService,
    private readonly historialWorkflowService: HistorialWorkflowService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
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

  /**
   * "Documentos diferidos": preguntas ARCHIVO/DOCUMENTOS_TABLA ocultas del
   * formulario en vivo (fp_oculto_en_formulario, o su sección tiene
   * fs_oculta_en_formulario) cuyo tipo de documento tiene plantilla
   * descargable (tdo_tiene_plantilla) — se generan DESPUÉS de guardar la
   * solicitud (necesitan el número de solicitud) y se suben aparte desde
   * Mis Documentos. Mientras falten, la solicitud no debe pasar a EJN.
   */
  private async obtenerDocumentosDiferidosConSubidos(
    solicitudId: number,
    runner: DataSource | any = this.dataSource,
  ) {
    // La versión del formulario y los archivos ya subidos son consultas
    // independientes entre sí (ninguna necesita el resultado de la otra) —
    // se piden en paralelo en vez de en serie para no sumar dos idas y
    // vueltas a la BD remota una detrás de la otra.
    const [[solicitud], subidos] = await Promise.all([
      runner.query(
        `SELECT sol_formulario_version FROM solicitudes WHERE sol_id = @0`,
        [solicitudId],
      ),
      runner.query(
        `
        SELECT sa.sa_id, fp.fp_tipo_documento_id AS tdo_id
        FROM Solicitud_archivo sa
        JOIN Formulario_pregunta fp ON fp.fp_id = sa.sa_fp_id
        WHERE sa.sa_sol_id = @0 AND sa.sa_estado = 'activo'
          AND fp.fp_tipo_documento_id IS NOT NULL
        ORDER BY sa.sa_id ASC
        `,
        [solicitudId],
      ),
    ]);
    const version = solicitud?.sol_formulario_version ?? 1;

    const diferidos = await runner.query(
      `
      SELECT DISTINCT td.tdo_id, td.tdo_nombre, td.tdo_plantilla_contenido, td.tdo_tipo_plantilla,
        td.tdo_formato_codigo, td.tdo_formato_codigo_secundario, td.tdo_revision, td.tdo_paginas_total,
        fp.fp_id
      FROM Formulario_pregunta fp
      JOIN Tipos_documentos td ON td.tdo_id = fp.fp_tipo_documento_id
      LEFT JOIN Formulario_secciones fs ON fs.fs_id = fp.seccion_id
      WHERE fp.fp_estado = 1
        AND td.tdo_tiene_plantilla = 1
        AND (fp.fp_oculto_en_formulario = 1 OR fs.fs_oculta_en_formulario = 1)
        AND ISNULL(fp.fp_version, 1) = @0
      `,
      [version],
    );

    if (diferidos.length === 0) {
      return { diferidos: [] as any[], subidosSet: new Set<number>() };
    }

    // Si un tdo_id llegara a tener más de un archivo activo, se usa el más
    // reciente (sa_id más alto, por el ORDER BY + sobrescritura en el Map).
    const subidosPorTdo = new Map<number, number>();
    for (const s of subidos) subidosPorTdo.set(s.tdo_id, s.sa_id);

    return {
      diferidos,
      subidosSet: new Set(subidosPorTdo.keys()),
      subidosPorTdo,
    };
  }

  // Solo los que aún faltan por subir — usado para decidir si la solicitud
  // puede avanzar a Ejecutivo de Negocios (ver cambiarEstado/crearSolicitud).
  async obtenerDocumentosDiferidosFaltantes(
    solicitudId: number,
    runner: DataSource | any = this.dataSource,
  ): Promise<
    {
      tdo_id: number;
      tdo_nombre: string;
      tdo_plantilla_contenido: string | null;
      tdo_tipo_plantilla: 'TEXTO' | 'PDF_SOLICITUD';
      tdo_formato_codigo: string | null;
      tdo_formato_codigo_secundario: string | null;
      tdo_revision: string | null;
      tdo_paginas_total: number | null;
      fp_id: number;
    }[]
  > {
    const { diferidos, subidosSet } =
      await this.obtenerDocumentosDiferidosConSubidos(solicitudId, runner);
    return diferidos.filter((d: any) => !subidosSet.has(d.tdo_id));
  }

  // Todos los documentos diferidos de la solicitud (ya subidos o no) — usado
  // para mostrarlos siempre juntos en Mis Documentos, aunque alguno ya se
  // haya subido antes; el botón de envío se habilita cuando todos quedan
  // en `yaSubido: true` (subidos antes o en la sesión actual).
  async obtenerDocumentosDiferidos(
    solicitudId: number,
    runner: DataSource | any = this.dataSource,
  ): Promise<
    {
      tdo_id: number;
      tdo_nombre: string;
      tdo_plantilla_contenido: string | null;
      tdo_tipo_plantilla: 'TEXTO' | 'PDF_SOLICITUD';
      tdo_formato_codigo: string | null;
      tdo_formato_codigo_secundario: string | null;
      tdo_revision: string | null;
      tdo_paginas_total: number | null;
      fp_id: number;
      yaSubido: boolean;
      sa_id: number | null;
    }[]
  > {
    const { diferidos, subidosPorTdo } =
      await this.obtenerDocumentosDiferidosConSubidos(solicitudId, runner);
    return diferidos.map((d: any) => ({
      ...d,
      yaSubido: subidosPorTdo.has(d.tdo_id),
      sa_id: subidosPorTdo.get(d.tdo_id) ?? null,
    }));
  }

  // Usado por "Mis Documentos" para decidir si aún debe mostrar la sección
  // de documentos diferidos (con su botón de envío) — ya no basta con "falta
  // alguno por subir", porque ahora los archivos se suben de inmediato al
  // seleccionarlos: puede que todos estén subidos pero el cliente todavía no
  // haya pulsado "Enviar e informar a Cartonera" para avanzar el estado.
  async solicitudEnEsperaDocumentosDiferidos(solicitud: {
    sol_estado_id: number;
    sol_resultado_etapa_id: number;
  }): Promise<boolean> {
    const [resultadoPendDocs] = await this.dataSource.query(
      `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PEND_DOCS'`,
    );
    return (
      Number(solicitud.sol_estado_id) === 2 &&
      Number(solicitud.sol_resultado_etapa_id) === resultadoPendDocs?.wee_id
    );
  }

  private async resolveHistorialColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_sol_id') IS NOT NULL THEN 'seh_sol_id' ELSE 'sa_sol_id' END AS solicitud_col,
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
      // Capturar el estado/etapa/resultado previos: sirve para saber si esta
      // es una transición real (evita notificar dos veces cuando una
      // solicitud nueva se crea directamente con estado PENDIENTE y luego se
      // llama a este método de forma redundante con el mismo estado) y para
      // no duplicar filas de historial cuando no hubo cambio de etapa/resultado.
      const solicitudPrevioResult = await queryRunner.query(
        `SELECT sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id
         FROM solicitudes
         WHERE sol_id = @0`,
        [solicitudId],
      );
      const solicitudPrevio = solicitudPrevioResult?.[0] ?? null;
      const estadoPrevio = solicitudPrevio?.sol_estado_id ?? null;
      const etapaPrevia = solicitudPrevio?.sol_etapa_actual_id ?? null;
      const resultadoPrevio = solicitudPrevio?.sol_resultado_etapa_id ?? null;

      // Verificar si la solicitud está en estado PENDIENTE + etapa ASC + resultado RECHAZADO
      // Si se está cambiando a REVISIÓN, cambiar también el resultado a PENDIENTE
      let resultadoIdActualizar: number | null = null;

      if (estadoId === 3 && solicitudPrevio) {
        // ASC = 3, RECHAZADO = 3, PENDIENTE = 1
        const estaPendiente = estadoPrevio === 2;
        const estaEnASC = etapaPrevia === 3;
        const estaRechazado = resultadoPrevio === 3;

        if (estaPendiente && estaEnASC && estaRechazado) {
          // Cambiar resultado a PENDIENTE cuando el cliente edita después de rechazo
          resultadoIdActualizar = 1;
          console.log(
            `✅ Caso especial detectado: Solicitud ${solicitudId} de Pendiente+ASC+Rechazado → Revisión. Resultado: PENDIENTE`,
          );
        }
      }

      // Obtener etapas según el estado
      let etapaId: number | null = null;
      let mensajeTransicion = '';
      let resultadoCodigo = 'PENDIENTE';
      let documentosDiferidosFaltantes: { tdo_id: number; tdo_nombre: string }[] =
        [];
      // Texto que ve el cliente en su listado de solicitudes (columna
      // Observaciones). Antes se calculaba en el frontend a partir de
      // estado/etapa/resultado; ahora queda guardado en la fila para que
      // refleje el evento real que lo origino.
      let observacionCliente: string | null = null;

      if (estadoId === 1) {
        // BORRADOR → Etapa CLI
        const etapaResult = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CLI'`,
        );
        etapaId = etapaResult?.[0]?.wet_id;
        mensajeTransicion =
          'Solicitud guardada como BORRADOR - Cliente llenando formulario';
        observacionCliente =
          'Puedes terminar de modificar tu formulario cuando lo desees.';
      } else if (estadoId === 2) {
        documentosDiferidosFaltantes = await this.obtenerDocumentosDiferidosFaltantes(
          solicitudId,
          queryRunner,
        );

        if (documentosDiferidosFaltantes.length > 0) {
          // Aún faltan documentos que se generan/suben después de guardar
          // (ej. cartas con {{numero_solicitud}}) — se queda en etapa CLI
          // con un resultado distinto, en vez de pasar a Ejecutivo de
          // Negocios, hasta que el cliente los suba desde Mis Documentos.
          const etapaResult = await queryRunner.query(
            `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CLI'`,
          );
          etapaId = etapaResult?.[0]?.wet_id;
          resultadoCodigo = 'PEND_DOCS';
          mensajeTransicion = `Solicitud registrada - faltan documentos por generar y subir: ${documentosDiferidosFaltantes
            .map((d) => d.tdo_nombre)
            .join(', ')}`;
          observacionCliente = `Aún faltan generar y subir: ${documentosDiferidosFaltantes
            .map((d) => d.tdo_nombre)
            .join(', ')}.`;
        } else {
          // PENDIENTE → Etapa EJN
          const etapaResult = await queryRunner.query(
            `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN'`,
          );
          etapaId = etapaResult?.[0]?.wet_id;
          mensajeTransicion = 'Solicitud enviada a Ejecutivo de Negocios';
          observacionCliente =
            'Formulario y documentos cargados correctamente. Puedes editar hasta que Cartonera revise tu solicitud.';
        }
      }
      // Para estados 3+ (REVISIÓN, COMPLETADA), no cambiamos la etapa

      // Resolver el resultado de etapa (PENDIENTE, o PEND_DOCS si faltan
      // documentos diferidos) una sola vez, para usarlo tanto en el UPDATE
      // como en el historial.
      let resultadoId: number | null = null;
      if (etapaId !== null) {
        const resultadoResult = await queryRunner.query(
          `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = @0`,
          [resultadoCodigo],
        );
        resultadoId = resultadoResult?.[0]?.wee_id ?? null;
      }

      // Actualizar estado (y etapa si corresponde)
      let updateSQL = `
        UPDATE solicitudes
        SET sol_estado_id = @0,
            sol_updated_at = GETDATE(),
            sol_usuario_modifica = @1
      `;
      const params: any[] = [estadoId, usuarioId];

      if (etapaId !== null) {
        updateSQL += `, sol_etapa_actual_id = @${params.length}`;
        params.push(etapaId);
      }

      if (resultadoIdActualizar !== null) {
        updateSQL += `, sol_resultado_etapa_id = @${params.length}`;
        params.push(resultadoIdActualizar);
      } else if (etapaId !== null && resultadoId !== null) {
        updateSQL += `, sol_resultado_etapa_id = @${params.length}`;
        params.push(resultadoId);
      }

      if (observacionCliente !== null) {
        updateSQL += `, sol_observacion_cliente = @${params.length}`;
        params.push(observacionCliente);
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
        // Evitar filas duplicadas en el historial cuando se reenvía/guarda
        // la solicitud sin que haya una transición real de etapa/resultado
        // (p.ej. el cliente guarda varias veces el mismo formulario).
        const esTransicionReal =
          etapaId !== etapaPrevia || resultadoId !== resultadoPrevio;

        if (resultadoId && esTransicionReal) {
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
        } else if (
          estadoId === 2 &&
          estadoPrevio !== 2 &&
          documentosDiferidosFaltantes.length === 0
        ) {
          // Transición real hacia PENDIENTE (p.ej. cliente envía un borrador
          // ya existente): notificar registro igual que al crear una
          // solicitud nueva, para que cliente/comercial/ejecutivo se enteren.
          // No se notifica todavía si quedó en PEND_DOCS: aún no llega a
          // Ejecutivo de Negocios.
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

      return {
        ok: true,
        mensaje: 'Estado actualizado',
        documentosDiferidosFaltantes,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Se llama desde "Mis Documentos" después de subir un documento diferido
   * (ej. la carta generada con la plantilla). Si ya no falta ninguno, recién
   * ahí pasa la solicitud de CLI+PEND_DOCS a EJN+PENDIENTE (la transición
   * que quedó pendiente en cambiarEstado). Si todavía falta alguno, no toca
   * nada y solo informa cuáles.
   */
  async verificarYAvanzarDocumentosPlantilla(
    solicitudId: number,
    usuarioId: number = 1,
  ) {
    const faltantes = await this.obtenerDocumentosDiferidosFaltantes(
      solicitudId,
    );

    if (faltantes.length > 0) {
      return { ok: true, avanzo: false, documentosDiferidosFaltantes: faltantes };
    }

    const [solicitud] = await this.dataSource.query(
      `SELECT sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );

    if (
      !solicitud ||
      !(await this.solicitudEnEsperaDocumentosDiferidos(solicitud))
    ) {
      // No estaba en espera de documentos diferidos: nada que avanzar.
      return { ok: true, avanzo: false, documentosDiferidosFaltantes: [] };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [etapaEJN] = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'EJN'`,
      );
      const [resultadoPendiente] = await queryRunner.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE'`,
      );

      await queryRunner.query(
        `UPDATE solicitudes
         SET sol_etapa_actual_id = @0, sol_resultado_etapa_id = @1,
             sol_usuario_modifica = @2, sol_updated_at = GETDATE()
         WHERE sol_id = @3`,
        [etapaEJN.wet_id, resultadoPendiente.wee_id, usuarioId, solicitudId],
      );

      await queryRunner.query(
        `INSERT INTO solicitud_workflow_historial
         (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario, swh_fecha)
         VALUES (@0, @1, @2, @3, @4, GETDATE())`,
        [
          solicitudId,
          etapaEJN.wet_id,
          resultadoPendiente.wee_id,
          usuarioId,
          'Cliente subió los documentos generados pendientes - Solicitud enviada a Ejecutivo de Negocios',
        ],
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    try {
      await this.notificacionesService.notificarRegistroSolicitud(
        solicitudId,
        true,
      );
    } catch (notificationError: any) {
      console.error(
        '⚠️ Error enviando notificación de estado:',
        notificationError?.message || notificationError,
      );
    }

    return { ok: true, avanzo: true, documentosDiferidosFaltantes: [] };
  }

  async aprobarRechazarSolicitud(
    solicitudId: number,
    aprobado: boolean,
    motivo_rechazo_id?: number,
    modo_solucion?: string,
    fecha_estimada_respuesta_comercial?: Date,
    usuario_modifica?: number,
    documentosFaltantes?: number[],
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

      // Obtener correo del cliente ANTES de hacer el commit, para decidir si notificar
      let clienteEmail: string | null = null;

      if (!aprobado) {
        const [solicitudData] = await queryRunner.query(
          `SELECT c.cli_correo
           FROM solicitudes s
           LEFT JOIN clientes c ON s.sol_cliente_id = c.cli_id
           WHERE s.sol_id = @0`,
          [solicitudId],
        );
        clienteEmail = solicitudData?.cli_correo || null;
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

      // Persistir el flag "requiere cambio" por documento cuando el
      // auxiliar rechaza por fecha de emisión incorrecta. Se resetea
      // primero para no arrastrar marcas de un rechazo anterior, y luego
      // se marcan solo los tipos de documento indicados en el checklist.
      if (!aprobado) {
        await queryRunner.query(
          `UPDATE Solicitud_archivo SET sa_requiere_cambio = 0 WHERE sa_sol_id = @0 AND sa_estado = 'activo'`,
          [solicitudId],
        );

        if (documentosFaltantes && documentosFaltantes.length > 0) {
          const placeholders = documentosFaltantes
            .map((_, idx) => `@${idx + 1}`)
            .join(',');
          await queryRunner.query(
            `UPDATE sa
             SET sa_requiere_cambio = 1
             FROM Solicitud_archivo sa
             JOIN Formulario_pregunta fp ON fp.fp_id = sa.sa_fp_id
             WHERE sa.sa_sol_id = @0 AND sa.sa_estado = 'activo'
               AND fp.fp_tipo_documento_id IN (${placeholders})`,
            [solicitudId, ...documentosFaltantes],
          );
        }
      }

      await queryRunner.commitTransaction();

      // Enviar correo al cliente si la solicitud fue rechazada
      if (!aprobado && clienteEmail) {
        try {
          let motivoDescripcion: string | null = null;
          if (motivo_rechazo_id) {
            const [motivoData] = await this.dataSource.query(
              `SELECT mrs_descripcion FROM Motivos_rechazo_solicitud WHERE mrs_id = @0`,
              [motivo_rechazo_id],
            );
            motivoDescripcion = motivoData?.mrs_descripcion || null;
          }

          let documentosFaltantesNombres: string[] = [];
          if (documentosFaltantes && documentosFaltantes.length > 0) {
            const placeholders = documentosFaltantes
              .map((_, idx) => `@${idx}`)
              .join(',');
            const documentosData = await this.dataSource.query(
              `SELECT tdo_nombre FROM Tipos_documentos WHERE tdo_id IN (${placeholders})`,
              documentosFaltantes,
            );
            documentosFaltantesNombres = documentosData.map(
              (d: any) => d.tdo_nombre,
            );
          }

          await this.notificacionesService.notificarRechazoSolicitud(
            solicitudId,
            motivoDescripcion,
            documentosFaltantesNombres,
          );
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

      // ASC aprobó → la solicitud queda pendiente en la bandeja del
      // Oficial de Cumplimiento. Avisar a cada usuario activo con ese rol.
      if (aprobado) {
        try {
          await this.notificacionesService.notificarSolicitudPendienteAlRol(
            solicitudId,
            'OC',
            'SOLICITUD_PENDIENTE_OC',
          );
        } catch (emailError) {
          console.warn(
            '[aprobarRechazarSolicitud] Error enviando correo a Oficial de Cumplimiento:',
            emailError,
          );
        }
      }

      return {
        success: true,
        message: aprobado
          ? 'Solicitud aprobada exitosamente'
          : 'Solicitud rechazada exitosamente',
        sa_sol_id: solicitudId,
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
    sa_sol_id: number,
    consumo_mensual_proyectado: number | null,
    observacionesComercial?: string,
    usuario_modifica?: number,
    fecha_real_ejecutivo?: string,
  ) {
    console.log(
      `💾 [guardarGestionEjecutivo] Guardando concepto para solicitud ${sa_sol_id}`,
    );

    try {
      const [solicitudActual] = await this.dataSource.query(
        `SELECT we.wet_codigo
         FROM solicitudes s
         LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_etapa_actual_id
         WHERE s.sol_id = @0`,
        [sa_sol_id],
      );

      if (solicitudActual?.wet_codigo !== 'EJN') {
        throw new Error(
          `La solicitud no está en la etapa Ejecutivo de Negocios (etapa actual: ${solicitudActual?.wet_codigo ?? 'desconocida'})`,
        );
      }

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
        sa_sol_id,
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
        'Tu solicitud se encuentra en revisión.',
      ];
      let updateSQL = `UPDATE solicitudes SET sol_consumo_mensual_proyectado = @0, sol_observacion_ejn = @1, sol_estado_id = @2, sol_usuario_modifica = @3, sol_updated_at = GETDATE(), sol_observacion_cliente = @4`;

      if (fecha_real_ejecutivo) {
        updateSQL += `, sol_fecha_real_ejecutivo = @${updateParams.length}`;
        updateParams.push(fecha_real_ejecutivo);
      } else {
        updateSQL += `, sol_fecha_real_ejecutivo = GETDATE()`;
      }

      updateSQL += ` WHERE sol_id = @${updateParams.length}`;
      updateParams.push(sa_sol_id);

      await this.dataSource.query(updateSQL, updateParams);

      // EJN aprobó → la solicitud queda pendiente en la bandeja del
      // Auxiliar de Servicio al Cliente. Avisar a cada usuario activo con
      // ese rol (correo propio, no bloquea la respuesta si falla).
      try {
        await this.notificacionesService.notificarSolicitudPendienteAlRol(
          sa_sol_id,
          'ASC',
          'SOLICITUD_PENDIENTE_ASC',
        );
      } catch (notificationError) {
        console.error(
          '⚠️ [guardarGestionEjecutivo] Error enviando correo a Auxiliar Servicio Cliente:',
          notificationError,
        );
      }

      return {
        success: true,
        sa_sol_id,
        mensaje: 'Concepto ejecutivo registrado exitosamente',
        workflow: resultado,
      };
    } catch (error) {
      console.error(`❌ [guardarGestionEjecutivo] Error:`, error);
      throw error;
    }
  }

  async guardarConceptoGenerico(
    sa_sol_id: number,
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
      `💾 [guardarConceptoGenerico] Solicitud ${sa_sol_id}, siguiente: ${etapa_codigo_siguiente}, aprobado: ${aprobado}`,
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
        [sa_sol_id],
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
      // Observacion que ve el cliente en su listado de solicitudes.
      let observacionCliente: string;

      if (!aprobado) {
        etapaDestId = etapaActualId;
        estadoId = estadoRechazada.ses_id;
        resultadoCodigo = 'RECHAZADO';
        observacionCliente = `Solicitud rechazada de forma definitiva${
          etapaActualCodigo === 'OFC' ? ' por Cumplimiento' : ''
        }. Revisa el correo enviado para más detalle.`;
      } else if (etapa_codigo_siguiente) {
        const [etapaSiguiente] = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = @0`,
          [etapa_codigo_siguiente],
        );
        etapaDestId = etapaSiguiente.wet_id;
        estadoId = estadoRevision.ses_id;
        resultadoCodigo = 'PENDIENTE';
        observacionCliente = 'Tu solicitud se encuentra en revisión.';
      } else {
        etapaDestId = etapaActualId;
        estadoId = estadoAprobada.ses_id;
        resultadoCodigo = 'APROBADO';
        observacionCliente =
          '¡Tu solicitud fue aprobada! Ya puedes operar con el cupo asignado.';
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
        observacionCliente,
        sa_sol_id,
      ];
      let updateSQL = `UPDATE solicitudes SET
        sol_estado_id = @0,
        sol_etapa_actual_id = @1,
        sol_resultado_etapa_id = @2,
        sol_usuario_modifica = @3,
        sol_updated_at = GETDATE(),
        sol_observacion_cliente = @4
        ${columnaFecha}`;

      if (!aprobado && motivo_rechazo_id) {
        updateSQL += `, sol_motivo_rechazo_id = @${params.length}`;
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

      updateSQL += ` WHERE sol_id = @5`;

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
            sol_updated_at = GETDATE(),
            sol_observacion_cliente = @4
            ${columnaFecha}`;

          if (!aprobado && motivo_rechazo_id) {
            const basicParams = [
              estadoId,
              etapaDestId,
              resultadoWorkflow.wee_id,
              usuario_modifica,
              observacionCliente,
              sa_sol_id,
              motivo_rechazo_id,
            ];
            await queryRunner.query(
              basicUpdateSQL + `, sol_motivo_rechazo_id = @6 WHERE sol_id = @5`,
              basicParams,
            );
          } else {
            const basicParams = [
              estadoId,
              etapaDestId,
              resultadoWorkflow.wee_id,
              usuario_modifica,
              observacionCliente,
              sa_sol_id,
            ];
            await queryRunner.query(
              basicUpdateSQL + ` WHERE sol_id = @5`,
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
          sa_sol_id,
          etapaActualId,
          resultadoWorkflow.wee_id,
          usuario_modifica,
          comentario || mensajeHistorial,
        ],
      );

      await queryRunner.commitTransaction();

      if (aprobado && etapaActualCodigo === 'CC2') {
        try {
          await this.enviarCartaVinculacionPorCorreo(sa_sol_id, condiciones);
        } catch (emailError) {
          console.error(
            `⚠️ [guardarConceptoGenerico] Error enviando correo:`,
            emailError,
          );
        }
      }

      // Aprobado con etapa siguiente definida (OFC→CC1, CC1→CC2): avisar a
      // cada usuario activo del rol destino. El código de la etapa de
      // workflow (wet_codigo) coincide con el código de rol excepto OFC,
      // cuyo rol es 'OC' (Oficial de Cumplimiento).
      if (aprobado && etapa_codigo_siguiente) {
        const rolPorEtapaSiguiente: Record<string, string> = {
          ASC: 'ASC',
          OFC: 'OC',
          CC1: 'CC1',
          CC2: 'CC2',
        };
        const plantillaPorRol: Record<string, string> = {
          ASC: 'SOLICITUD_PENDIENTE_ASC',
          OC: 'SOLICITUD_PENDIENTE_OC',
          CC1: 'SOLICITUD_PENDIENTE_CC1',
          CC2: 'SOLICITUD_PENDIENTE_CC2',
        };
        const rolDestino = rolPorEtapaSiguiente[etapa_codigo_siguiente];
        if (rolDestino) {
          try {
            await this.notificacionesService.notificarSolicitudPendienteAlRol(
              sa_sol_id,
              rolDestino,
              plantillaPorRol[rolDestino],
            );
          } catch (emailError) {
            console.error(
              `⚠️ [guardarConceptoGenerico] Error enviando correo a ${rolDestino}:`,
              emailError,
            );
          }
        }
      }

      // Rechazo del Oficial de Cumplimiento: es definitivo (no vuelve al
      // cliente para corregir, a diferencia del rechazo de ASC), así que el
      // cliente solo se entera si se le avisa por correo aquí.
      if (!aprobado && etapaActualCodigo === 'OFC') {
        try {
          await this.notificacionesService.notificarRechazoDefinitivoSolicitud(
            sa_sol_id,
            comentario || null,
          );
        } catch (emailError) {
          console.error(
            `⚠️ [guardarConceptoGenerico] Error enviando correo de rechazo:`,
            emailError,
          );
        }
      }

      return {
        success: true,
        sa_sol_id,
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

  // Comité de Crédito 1 no aprueba ni rechaza: solo deja su revisión
  // (evaluación de riesgo, límite/plazo recomendado, observaciones) y la
  // solicitud siempre avanza a Comité de Crédito 2, que es quien decide.
  async guardarRevisionComiteCredito1(
    sa_sol_id: number,
    comentario: string,
    usuario_modifica: number,
  ) {
    console.log(
      `💾 [guardarRevisionComiteCredito1] Solicitud ${sa_sol_id}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [solicitudActual] = await queryRunner.query(
        `SELECT sol_etapa_actual_id FROM solicitudes WHERE sol_id = @0`,
        [sa_sol_id],
      );
      const etapaActualId = solicitudActual?.sol_etapa_actual_id;

      const [etapaSiguiente] = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CC2'`,
      );
      const [estadoRevision] = await queryRunner.query(
        `SELECT ses_id FROM solicitud_estados WHERE ses_codigo = 'REVISION'`,
      );
      const [resultadoPendiente] = await queryRunner.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE'`,
      );

      await queryRunner.query(
        `UPDATE solicitudes SET
          sol_estado_id = @0,
          sol_etapa_actual_id = @1,
          sol_resultado_etapa_id = @2,
          sol_usuario_modifica = @3,
          sol_updated_at = GETDATE(),
          sol_fecha_real_comite_credito_1 = GETDATE(),
          sol_observacion_cliente = @5
        WHERE sol_id = @4`,
        [
          estadoRevision.ses_id,
          etapaSiguiente.wet_id,
          resultadoPendiente.wee_id,
          usuario_modifica,
          sa_sol_id,
          'Tu solicitud se encuentra en revisión.',
        ],
      );

      await queryRunner.query(
        `INSERT INTO solicitud_workflow_historial
         (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_comentario)
         VALUES (@0, @1, @2, @3, @4)`,
        [
          sa_sol_id,
          etapaActualId,
          resultadoPendiente.wee_id,
          usuario_modifica,
          comentario || 'Revisión de Comité de Crédito 1',
        ],
      );

      await queryRunner.commitTransaction();

      try {
        await this.notificacionesService.notificarSolicitudPendienteAlRol(
          sa_sol_id,
          'CC2',
          'SOLICITUD_PENDIENTE_CC2',
        );
      } catch (emailError) {
        console.error(
          `⚠️ [guardarRevisionComiteCredito1] Error enviando correo:`,
          emailError,
        );
      }

      return {
        success: true,
        sa_sol_id,
        mensaje: 'Revisión registrada exitosamente',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`❌ [guardarRevisionComiteCredito1] Error:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async actualizarEstadoFlujoAutomatico(
    sa_sol_id: number,
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
        sa_sol_id,
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
    sa_sol_id: number,
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
          sa_sol_id,
        ],
      );

      return {
        success: true,
        sa_sol_id,
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
        sa_sol_id: solicitudId,
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
             sol_updated_at = GETDATE(),
             sol_observacion_cliente = @5
         WHERE sol_id = @4`,
        [3, 3, 1, usuarioId, solicitudId, 'Tu solicitud se encuentra en revisión.'],
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
    sa_sol_id: number,
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
          s.sol_forma_pago,
          co.cop_nombre AS centro_nombre
        FROM solicitudes s
        LEFT JOIN clientes c ON c.${lookup.cliId} = s.sol_cliente_id
        LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
        WHERE s.sol_id = @0`,
        [sa_sol_id],
      );

      if (!solicitud || !solicitud.cliente_email) {
        console.warn(
          `⚠️ [enviarCartaVinculacionPorCorreo] No se encontró cliente o email para solicitud ${sa_sol_id}`,
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
        solicitud.cliente_nombre,
      );

      // Persistir el PDF para que aparezca en "Mis Documentos" del cliente.
      // Independiente del envío de correo (try/catch propio): si el storage
      // falla igual debe intentarse enviar el correo con el buffer ya
      // generado, y viceversa — ninguno de los dos debe tumbar la
      // aprobación, que ya quedó confirmada (commitTransaction) antes de
      // que se invoque esta función.
      try {
        const nombreArchivo = `carta-vinculacion-${solicitud.sol_numero_solicitud}.pdf`;
        const carpeta = `documentos-solicitudes/${solicitud.centro_nombre || 'sin-centro'}/cartas/${solicitud.sol_numero_solicitud}`;
        const subida = await this.storageService.upload(pdfBuffer, {
          folder: carpeta,
          filename: nombreArchivo,
          mimetype: 'application/pdf',
        });

        const [existente] = await this.dataSource.query(
          `SELECT scv_id FROM Solicitud_carta_vinculacion WHERE scv_sol_id = @0`,
          [sa_sol_id],
        );

        if (existente) {
          await this.dataSource.query(
            `UPDATE Solicitud_carta_vinculacion SET
              scv_nombre_original = @0,
              scv_ruta_almacenamiento = @1,
              scv_tipo_mime = @2,
              scv_tamano_bytes = @3,
              scv_created_at = GETDATE()
            WHERE scv_sol_id = @4`,
            [
              nombreArchivo,
              subida.url,
              'application/pdf',
              pdfBuffer.length,
              sa_sol_id,
            ],
          );
        } else {
          await this.dataSource.query(
            `INSERT INTO Solicitud_carta_vinculacion
             (scv_sol_id, scv_nombre_original, scv_ruta_almacenamiento, scv_tipo_mime, scv_tamano_bytes)
             VALUES (@0, @1, @2, @3, @4)`,
            [
              sa_sol_id,
              nombreArchivo,
              subida.url,
              'application/pdf',
              pdfBuffer.length,
            ],
          );
        }
      } catch (storageError) {
        console.error(
          `⚠️ [enviarCartaVinculacionPorCorreo] Error persistiendo el PDF:`,
          storageError,
        );
      }

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

  // Clasifica el contenido de la carta (con placeholders ya reemplazados)
  // en bloques de subtítulo/párrafo/lista, igual que construirCuerpoHtml en
  // FRONTEND/src/lib/carta-pdf.util.ts — necesario porque pdfkit justifica
  // TODAS las líneas de un mismo `.text()` salvo la última del bloque
  // completo, no por párrafo: pasar toda la carta de un solo tirón con
  // align:'justify' (como hacía la versión anterior) estira también las
  // líneas cortas de la lista de términos, viéndose rarísimo.
  private clasificarBloquesCarta(
    contenido: string,
  ): (
    | { tipo: 'subtitulo'; texto: string }
    | { tipo: 'parrafo'; texto: string }
    | { tipo: 'lista'; lineas: string[] }
  )[] {
    const bloques = contenido
      .split(/\n\s*\n/)
      .map((bloque) =>
        bloque
          .split('\n')
          .map((linea) => linea.trim())
          .filter(Boolean),
      )
      .filter((lineas) => lineas.length > 0);

    return bloques.map((lineas) => {
      if (lineas.length === 1) {
        const esSubtitulo = lineas[0].length <= 60 && lineas[0].endsWith(':');
        return esSubtitulo
          ? ({ tipo: 'subtitulo', texto: lineas[0] } as const)
          : ({ tipo: 'parrafo', texto: lineas[0] } as const);
      }
      return { tipo: 'lista' as const, lineas };
    });
  }

  private dibujarBloqueCarta(
    doc: any,
    bloque:
      | { tipo: 'subtitulo'; texto: string }
      | { tipo: 'parrafo'; texto: string }
      | { tipo: 'lista'; lineas: string[] },
  ) {
    if (bloque.tipo === 'subtitulo') {
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .fillColor('#1a1a1a')
        .text(bloque.texto, { align: 'left' });
      doc.moveDown(0.4);
    } else if (bloque.tipo === 'parrafo') {
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#1a1a1a')
        .text(bloque.texto, { align: 'justify', lineGap: 4 });
      doc.moveDown(0.7);
    } else {
      doc.fontSize(11).font('Helvetica').fillColor('#1a1a1a');
      for (const linea of bloque.lineas) {
        doc.text(linea, { align: 'left', lineGap: 3 });
      }
      doc.moveDown(0.7);
    }
  }

  private async generarPDFCarta(
    contenidoCarta: string,
    numeroSolicitud: string,
    clienteNombre?: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const PDFDocument = require('pdfkit');
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          bufferPages: true,
        });

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const fecha = new Date().toLocaleDateString('es-CO', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        // Membrete
        doc
          .fontSize(15)
          .font('Helvetica-Bold')
          .fillColor('#1a1a1a')
          .text('CARTONERA NACIONAL S.A.', { align: 'center' });
        doc
          .fontSize(9)
          .font('Helvetica-Oblique')
          .fillColor('#555555')
          .text('Vinculación Comercial', { align: 'center' });
        doc.moveDown(0.6);
        doc
          .strokeColor('#999999')
          .lineWidth(1)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .stroke();
        doc.moveDown(1.4);

        // Fecha
        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#1a1a1a')
          .text(`Bogotá D.C., ${fecha}`, { align: 'right' });
        doc.moveDown(1);

        // Destinatario
        doc.fontSize(12).font('Helvetica').text('Señor(a)');
        doc.font('Helvetica-Bold').text(clienteNombre || '-');
        doc.font('Helvetica').text('Ciudad');
        doc.moveDown(1);

        // Asunto
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Asunto: ', { continued: true })
          .font('Helvetica')
          .text(
            `Aprobación de solicitud de vinculación comercial No. ${numeroSolicitud}`,
          );
        doc.moveDown(1.2);

        // Cuerpo, clasificado en subtítulo/párrafo/lista
        const bloques = this.clasificarBloquesCarta(contenidoCarta);
        for (const bloque of bloques) {
          this.dibujarBloqueCarta(doc, bloque);
        }

        // Cierre
        doc.moveDown(0.5);
        doc
          .strokeColor('#dddddd')
          .lineWidth(1)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .stroke();
        doc.moveDown(0.5);
        doc
          .fontSize(8)
          .font('Helvetica')
          .fillColor('#888888')
          .text(
            `Documento generado electrónicamente el ${fecha} · Sistema de Vinculación Comercial`,
            { align: 'center' },
          );

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
}
