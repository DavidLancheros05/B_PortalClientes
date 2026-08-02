// src/solicitudes/solicitudes-workflow.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { MailService } from '../mail/mail.service';
import { WorkflowService } from './workflow.service';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';
import { ClienteArchivoService } from '../cliente-archivo/cliente-archivo.service';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../common/storage/storage.interface';
import { SolicitudEstadosService } from '../common/solicitud-estados/solicitud-estados.service';

@Injectable()
export class SolicitudesWorkflowService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesService: NotificacionesService,
    private readonly mailService: MailService,
    private readonly workflowService: WorkflowService,
    private readonly historialWorkflowService: HistorialWorkflowService,
    private readonly clienteArchivoService: ClienteArchivoService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly solicitudEstadosService: SolicitudEstadosService,
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
        SELECT sa.sa_id, sa.sa_nombre_original, fp.fp_tipo_documento_id AS tdo_id
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
        td.tdo_encabezado_tipo, td.tdo_encabezado_imagen_url,
        td.tdo_pie_pagina_tipo, td.tdo_pie_pagina_texto, td.tdo_pie_pagina_imagen_url,
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
      return {
        diferidos: [] as any[],
        subidosSet: new Set<number>(),
        subidosPorTdo: new Map<number, number>(),
        nombrePorTdo: new Map<number, string>(),
      };
    }

    // Si un tdo_id llegara a tener más de un archivo activo, se usa el más
    // reciente (sa_id más alto, por el ORDER BY + sobrescritura en el Map).
    const subidosPorTdo = new Map<number, number>();
    const nombrePorTdo = new Map<number, string>();
    for (const s of subidos) {
      subidosPorTdo.set(s.tdo_id, s.sa_id);
      nombrePorTdo.set(s.tdo_id, s.sa_nombre_original);
    }

    return {
      diferidos,
      subidosSet: new Set(subidosPorTdo.keys()),
      subidosPorTdo,
      nombrePorTdo,
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
      tdo_encabezado_tipo: 'NINGUNO' | 'IMAGEN' | 'FORMATO_OFICIAL' | null;
      tdo_encabezado_imagen_url: string | null;
      tdo_pie_pagina_tipo: 'NINGUNO' | 'TEXTO' | 'IMAGEN' | null;
      tdo_pie_pagina_texto: string | null;
      tdo_pie_pagina_imagen_url: string | null;
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
      tdo_encabezado_tipo: 'NINGUNO' | 'IMAGEN' | 'FORMATO_OFICIAL' | null;
      tdo_encabezado_imagen_url: string | null;
      tdo_pie_pagina_tipo: 'NINGUNO' | 'TEXTO' | 'IMAGEN' | null;
      tdo_pie_pagina_texto: string | null;
      tdo_pie_pagina_imagen_url: string | null;
      fp_id: number;
      yaSubido: boolean;
      sa_id: number | null;
      sa_nombre_original: string | null;
    }[]
  > {
    const { diferidos, subidosPorTdo, nombrePorTdo } =
      await this.obtenerDocumentosDiferidosConSubidos(solicitudId, runner);
    return diferidos.map((d: any) => ({
      ...d,
      yaSubido: subidosPorTdo.has(d.tdo_id),
      sa_id: subidosPorTdo.get(d.tdo_id) ?? null,
      sa_nombre_original: nombrePorTdo.get(d.tdo_id) ?? null,
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

      const estadoRevisionCheck =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo('REVISION');
      if (estadoId === estadoRevisionCheck?.id && solicitudPrevio) {
        const [estadoPendienteCheck, etapaASC, resultadoRechazado] =
          await Promise.all([
            this.solicitudEstadosService.obtenerEstadoPorCodigo('PENDIENTE'),
            this.workflowService.obtenerEtapaPorCodigo('ASC'),
            this.workflowService.obtenerResultadoPorCodigo('RECHAZADO'),
          ]);
        const estaPendiente = estadoPrevio === estadoPendienteCheck?.id;
        const estaEnASC = etapaPrevia === etapaASC?.wet_id;
        const estaRechazado = resultadoPrevio === resultadoRechazado?.wee_id;

        if (estaPendiente && estaEnASC && estaRechazado) {
          // Cambiar resultado a PENDIENTE cuando el cliente edita después de rechazo
          const resultadoPendienteCheck =
            await this.workflowService.obtenerResultadoPorCodigo('PENDIENTE');
          resultadoIdActualizar = resultadoPendienteCheck?.wee_id ?? null;
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

      if (estadoId === 2) {
        // Primera vez que entra a PENDIENTE = fecha real de envío. COALESCE
        // evita pisarla si el cliente es rechazado y reenvía después.
        updateSQL += `, sol_fecha_envio = COALESCE(sol_fecha_envio, GETDATE())`;
      }

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
          await this.historialWorkflowService.registrarTransicionConSLA(
            queryRunner,
            {
              solicitudId,
              etapaId,
              resultadoId,
              usuarioId,
              comentario: mensajeTransicion,
            },
          );
        }
      } else if (resultadoIdActualizar !== null) {
        // Registrar en historial si solo se cambió el resultado (sin cambiar etapa)
        const solicitudActual = await queryRunner.query(
          `SELECT sol_etapa_actual_id FROM solicitudes WHERE sol_id = @0`,
          [solicitudId],
        );

        if (solicitudActual.length > 0) {
          const { sol_etapa_actual_id } = solicitudActual[0];
          await this.historialWorkflowService.registrarTransicionConSLA(
            queryRunner,
            {
              solicitudId,
              etapaId: sol_etapa_actual_id,
              resultadoId: resultadoIdActualizar,
              usuarioId,
              comentario:
                'Cliente editó solicitud rechazada - Resultado vuelve a PENDIENTE',
            },
          );
        }
      }

      await queryRunner.commitTransaction();

      try {
        // NOTA: cambiarEstado() solo maneja transiciones a BORRADOR(1)/
        // PENDIENTE(2) — ver rama de arriba ("Para estados 3+ no cambiamos
        // la etapa"). Las transiciones reales a REVISION/APROBADA/RECHAZADA
        // pasan por guardarConceptoGenerico/aprobarRechazarSolicitud, que ya
        // tienen sus propias notificaciones correctas al cliente
        // (enviarCartaVinculacionPorCorreo, notificarRechazoSolicitud). Acá
        // había una rama que notificaba "aprobada/rechazada" cuando
        // estadoId era 3/4 — nunca se disparaba (nada llama a este método
        // con esos valores) y, si algún día se hubiera llamado, habría
        // duplicado el correo que ya envían esas otras funciones. Se retiró
        // en vez de solo corregir el número (ver
        // documentacion/auditoria-valores-quemados-hardcodeados.md, bug #2,
        // solución de fondo #1).
        if (
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

    // Texto que ve el cliente en su listado (columna Observaciones) una vez
    // ya no falta ningún documento diferido — mismo mensaje que usa
    // cambiarEstado() para el caso "sin diferidos pendientes".
    const observacionAlDia =
      'Formulario y documentos cargados correctamente. Puedes editar hasta que Cartonera revise tu solicitud.';

    const [solicitud] = await this.dataSource.query(
      `SELECT sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );

    if (
      !solicitud ||
      !(await this.solicitudEnEsperaDocumentosDiferidos(solicitud))
    ) {
      // No estaba en espera de documentos diferidos por este gate (ej. la
      // solicitud ya había avanzado de etapa por otra vía) — no hay nada
      // que avanzar, pero la Observación que ve el cliente puede haber
      // quedado congelada en el mensaje viejo de "faltan documentos"
      // aunque ya no falte ninguno. Se refresca solo en ese caso, sin
      // tocar etapa/resultado.
      await this.dataSource.query(
        `UPDATE solicitudes
         SET sol_observacion_cliente = @0
         WHERE sol_id = @1 AND sol_observacion_cliente LIKE 'Aún faltan generar y subir%'`,
        [observacionAlDia, solicitudId],
      );
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
             sol_observacion_cliente = @2,
             sol_usuario_modifica = @3, sol_updated_at = GETDATE()
         WHERE sol_id = @4`,
        [
          etapaEJN.wet_id,
          resultadoPendiente.wee_id,
          observacionAlDia,
          usuarioId,
          solicitudId,
        ],
      );

      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        {
          solicitudId,
          etapaId: etapaEJN.wet_id,
          resultadoId: resultadoPendiente.wee_id,
          usuarioId,
          comentario:
            'Cliente subió los documentos generados pendientes - Solicitud enviada a Ejecutivo de Negocios',
        },
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

      // Obtener IDs de estados desde BD (sin hardcodear)
      const estadoRevision =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'REVISION',
        );
      const estadoPendiente =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'PENDIENTE',
        );

      // Obtener etapa ASC (Auxiliar Servicio Cliente - la que está procesando)
      const etapaSACResult = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'ASC'`,
      );
      const etapaSAC = etapaSACResult?.[0];

      console.log('[aprobarRechazarSolicitud] Estados y etapas:', {
        estadoRevision: estadoRevision?.id,
        estadoPendiente: estadoPendiente?.id,
        etapaSAC: etapaSAC?.wet_id,
        modo_solucion,
      });

      let etapaDestId: number;
      let estadoId: number;
      let resultadoCodigo: string;
      let comentario: string;
      // Observación que ve el cliente en su listado de solicitudes
      // (sol_observacion_cliente) — decidida acá en vez de dejar que el
      // frontend la infiera del estado/etapa/resultado.
      let observacionCliente: string;

      if (aprobado) {
        // ASC aprueba → avanza a OFC en REVISIÓN
        const [etapaOFC] = await queryRunner.query(
          `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'OFC'`,
        );
        etapaDestId = etapaOFC.wet_id;
        estadoId = estadoRevision!.id;
        resultadoCodigo = 'PENDIENTE';
        comentario = 'Solicitud aprobada en Auxiliar Servicio Cliente';
        observacionCliente = 'Tu solicitud se encuentra en revisión.';
      } else {
        // ASC rechaza → etapa ASC con resultado RECHAZADO
        // El estado depende del modo_solucion
        etapaDestId = etapaSAC.wet_id;
        resultadoCodigo = 'RECHAZADO';

        if (modo_solucion === 'cliente_actualiza') {
          estadoId = estadoPendiente!.id;
          comentario =
            'Solicitud rechazada en Auxiliar Servicio Cliente - Cliente debe actualizar';
          observacionCliente =
            'El auxiliar de servicio al cliente rechazó tu solicitud porque algunos documentos tienen la fecha de emisión incorrecta o no corresponden. Corrige los documentos marcados en "Mis Documentos".';
        } else if (modo_solucion === 'auxiliar_actualiza') {
          estadoId = estadoRevision!.id;
          comentario =
            'Solicitud rechazada en Auxiliar Servicio Cliente - Auxiliar debe actualizar';
          observacionCliente =
            'Tu solicitud está en revisión. Te avisaremos por correo cuando haya una decisión.';
        } else {
          estadoId = estadoPendiente!.id;
          comentario = 'Solicitud rechazada en Auxiliar Servicio Cliente';
          observacionCliente =
            'Tu solicitud fue rechazada por el auxiliar de servicio al cliente.';
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

      const motivoValue =
        aprobado || !motivo_rechazo_id ? 'NULL' : motivo_rechazo_id;
      const fechaEstimadaValue = fecha_estimada_respuesta_comercial
        ? `'${fecha_estimada_respuesta_comercial.toISOString().split('T')[0]}'`
        : 'NULL';
      const usuarioModificaValue = usuario_modifica ?? 'NULL';

      await queryRunner.query(
        `
        UPDATE solicitudes SET
          sol_estado_id = ${estadoId},
          sol_etapa_actual_id = ${etapaDestId},
          sol_resultado_etapa_id = ${resultadoWorkflow.wee_id},
          sol_motivo_rechazo_id = ${motivoValue},
          sol_fecha_estimada_respuesta_comercial = ${fechaEstimadaValue},
          sol_fecha_real_auxiliar_servicio_cliente = GETDATE(),
          sol_usuario_modifica = ${usuarioModificaValue},
          sol_observacion_cliente = @0,
          sol_updated_at = GETDATE()
        WHERE sol_id = ${solicitudId}
      `,
        [observacionCliente],
      );

      // Registrar en historial de estados
      await queryRunner.query(`
        INSERT INTO Solicitudes_estados_hist
        (${histCols.solicitud_col}, ${histCols.estado_col}, ${histCols.usuario_col}, ${histCols.fecha_col})
        VALUES (${solicitudId}, ${estadoId}, ${usuarioModificaValue}, GETDATE())
      `);

      // Registrar transición en workflow historial (etapa ASC con su resultado)
      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        {
          solicitudId,
          etapaId: etapaSAC.wet_id,
          resultadoId: resultadoWorkflow.wee_id,
          usuarioId: usuario_modifica || 1,
          comentario,
        },
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

      // Enviar correo al cliente si la solicitud fue rechazada — salvo que
      // el modo de solución sea 'auxiliar_actualiza': ahí el auxiliar
      // corrige los documentos él mismo en /solicitudes/:id/editar (entra
      // desde /solicitudes/corregir-formulario-asc), sin involucrar al
      // cliente, así que no corresponde notificarlo. Ver
      // documentacion/Funcionalidades/modo-solucion-rechazo-asc.md.
      if (!aprobado && clienteEmail && modo_solucion !== 'auxiliar_actualiza') {
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
    toneladas_proyectadas: number | null,
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

      const estadoRevision =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'REVISION',
        );
      const estadoRevisionId = estadoRevision?.id;

      const resultado = await this.workflowService.cambiarEtapa(
        sa_sol_id,
        etapaSAC.wet_id,
        resultadoPD.wee_id,
        usuario_modifica,
        `Concepto ejecutivo registrado: Consumo $${consumo_mensual_proyectado}`,
      );

      const updateParams: any[] = [
        consumo_mensual_proyectado,
        toneladas_proyectadas,
        observacionesComercial,
        estadoRevisionId,
        usuario_modifica,
        'Tu solicitud se encuentra en revisión.',
      ];
      let updateSQL = `UPDATE solicitudes SET sol_consumo_mensual_proyectado = @0, sol_toneladas_proyectadas = @1, sol_observacion_ejn = @2, sol_estado_id = @3, sol_usuario_modifica = @4, sol_updated_at = GETDATE(), sol_observacion_cliente = @5`;

      if (fecha_real_ejecutivo) {
        updateSQL += `, sol_fecha_real_ejecutivo = @${updateParams.length}`;
        updateParams.push(fecha_real_ejecutivo);
      } else {
        updateSQL += `, sol_fecha_real_ejecutivo = GETDATE()`;
      }

      updateSQL += ` WHERE sol_id = @${updateParams.length}`;
      updateParams.push(sa_sol_id);

      await this.dataSource.query(updateSQL, updateParams);

      try {
        await this.guardarRespuestasConceptoEjecutivo(
          sa_sol_id,
          usuario_modifica,
          consumo_mensual_proyectado ?? null,
          toneladas_proyectadas ?? null,
          observacionesComercial ?? null,
        );
      } catch (respuestasError) {
        console.error(
          '⚠️ [guardarGestionEjecutivo] Error llenando sección CONCEPTO DEL EJECUTIVO:',
          respuestasError,
        );
      }

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
        `SELECT s.sol_etapa_actual_id, s.sol_cliente_id, we.wet_codigo
         FROM solicitudes s
         LEFT JOIN workflow_etapas we ON we.wet_id = s.sol_etapa_actual_id
         WHERE s.sol_id = @0`,
        [sa_sol_id],
      );
      const etapaActualId = solicitudActual?.sol_etapa_actual_id;
      const etapaActualCodigo = solicitudActual?.wet_codigo;
      const clienteIdSolicitud = solicitudActual?.sol_cliente_id;

      const estadoRevision =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'REVISION',
        );
      const estadoAprobada =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'APROBADA',
        );
      const estadoRechazada =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'RECHAZADA',
        );

      let etapaDestId: number;
      let estadoId: number;
      let resultadoCodigo: string;
      // Observacion que ve el cliente en su listado de solicitudes.
      let observacionCliente: string;

      if (!aprobado) {
        etapaDestId = etapaActualId;
        estadoId = estadoRechazada!.id;
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
        estadoId = estadoRevision!.id;
        resultadoCodigo = 'PENDIENTE';
        observacionCliente = 'Tu solicitud se encuentra en revisión.';
      } else {
        etapaDestId = etapaActualId;
        estadoId = estadoAprobada!.id;
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

      if (etapaActualCodigo === 'CC2') {
        await this.guardarRespuestasUsoExclusivo(
          queryRunner,
          sa_sol_id,
          aprobado,
          usuario_modifica,
          condiciones,
        );
      }

      // Promoción a Cliente_archivo: solo cuando la solicitud queda
      // APROBADA en CC2 (no antes) — un prospecto rechazado nunca llega a
      // ser "cliente creado", así que no debe archivar documentos para
      // reutilizar. Misma transacción/queryRunner que el resto de la
      // aprobación: si esto falla, se revierte junto con todo lo demás.
      if (aprobado && etapaActualCodigo === 'CC2' && clienteIdSolicitud) {
        await this.clienteArchivoService.promoverDocumentos(
          clienteIdSolicitud,
          sa_sol_id,
          queryRunner,
        );
      }

      const mensajeHistorial = aprobado
        ? `Aprobado en etapa ${etapaActualCodigo}`
        : `Rechazado en etapa ${etapaActualCodigo}`;

      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        {
          solicitudId: sa_sol_id,
          etapaId: etapaActualId,
          resultadoId: resultadoWorkflow.wee_id,
          usuarioId: usuario_modifica,
          comentario: comentario || mensajeHistorial,
        },
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

      // Rechazo de Oficial de Cumplimiento o Comité de Crédito 2: es
      // definitivo (no vuelve al cliente para corregir, a diferencia del
      // rechazo de ASC). Ya no se le avisa al cliente por correo — el
      // ejecutivo de negocios asignado recibe el aviso y gestiona el
      // seguimiento con el cliente por fuera del sistema (ver bandeja
      // "Solicitudes Rechazadas" y solicitudes-listados.service.ts::
      // getSolicitudesRechazadasPorEjecutivoId).
      if (!aprobado && (etapaActualCodigo === 'OFC' || etapaActualCodigo === 'CC2')) {
        try {
          await this.notificacionesService.notificarRechazoAlEjecutivo(
            sa_sol_id,
            etapaActualCodigo,
            comentario || null,
          );
        } catch (emailError) {
          console.error(
            `⚠️ [guardarConceptoGenerico] Error enviando correo de rechazo al ejecutivo:`,
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

  // Marca que el ejecutivo de negocios ya gestionó manualmente (fuera del
  // sistema) el seguimiento con el cliente tras un rechazo de OFC/CC2. No
  // toca sol_estado_id/sol_etapa_actual_id/sol_resultado_etapa_id — esos
  // siguen terminando en RECHAZADA como documenta FLUJO_ETAPAS.md; esto es
  // un tracker aparte, no una transición de workflow, así que no pasa por
  // guardarConceptoGenerico ni necesita transacción (un solo UPDATE sin
  // efectos dependientes).
  async finalizarGestionRechazo(solicitudId: number, usuarioId: number) {
    const [solicitud] = await this.dataSource.query(
      `SELECT sol_estado_id FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );
    if (!solicitud) {
      throw new Error('Solicitud no encontrada');
    }

    const estadoRechazada =
      await this.solicitudEstadosService.obtenerEstadoPorCodigo('RECHAZADA');
    if (solicitud.sol_estado_id !== estadoRechazada?.id) {
      throw new Error(
        'Solo se puede finalizar la gestión sobre una solicitud rechazada',
      );
    }

    await this.dataSource.query(
      `UPDATE solicitudes
       SET sol_gestion_rechazo_finalizada = 1,
           sol_fecha_gestion_rechazo = GETDATE(),
           sol_usuario_gestion_rechazo = @0
       WHERE sol_id = @1`,
      [usuarioId, solicitudId],
    );

    return { success: true };
  }

  // Upsert de una respuesta del formulario. `db` puede ser un queryRunner
  // (dentro de transacción) o el dataSource — ambos exponen .query().
  private async upsertRespuestaFormulario(
    db: { query: (sql: string, params?: any[]) => Promise<any> },
    sa_sol_id: number,
    fp_id: number,
    valores: {
      texto?: string | null;
      numero?: number | null;
      opcionId?: number | null;
    },
    usuario_modifica: number,
  ) {
    const [existente] = await db.query(
      `SELECT fr_id FROM Formulario_respuesta
       WHERE fr_solicitud_id = @0 AND fr_fp_id = @1`,
      [sa_sol_id, fp_id],
    );
    const params = [
      valores.texto ?? null,
      valores.numero ?? null,
      valores.opcionId ?? null,
      usuario_modifica,
    ];
    if (existente) {
      await db.query(
        `UPDATE Formulario_respuesta SET
           fr_valor_texto = @0, fr_valor_numero = @1, fr_valor_opcion_id = @2,
           fr_actualizado_por = @3, fr_updated_at = GETDATE(), fr_completado = 1
         WHERE fr_id = @4`,
        [...params, existente.fr_id],
      );
    } else {
      await db.query(
        `INSERT INTO Formulario_respuesta
           (fr_solicitud_id, fr_fp_id, fr_valor_texto, fr_valor_numero,
            fr_valor_opcion_id, fr_actualizado_por, fr_completado, fr_created_at)
         VALUES (@4, @5, @0, @1, @2, @3, 1, GETDATE())`,
        [...params, sa_sol_id, fp_id],
      );
    }
  }

  // El concepto del Ejecutivo de Negocios también se refleja como respuestas
  // de la sección "CONCEPTO DEL EJECUTIVO DE NEGOCIOS" del formulario
  // (oculta al cliente), igual que la sección USO EXCLUSIVO con el CC2.
  private async guardarRespuestasConceptoEjecutivo(
    sa_sol_id: number,
    usuario_modifica: number,
    consumo_mensual_proyectado: number | null,
    toneladas_proyectadas: number | null,
    observaciones: string | null,
  ) {
    const [solicitudActual] = await this.dataSource.query(
      `SELECT sol_formulario_version FROM solicitudes WHERE sol_id = @0`,
      [sa_sol_id],
    );
    const version = solicitudActual?.sol_formulario_version ?? 1;

    const preguntas: { fp_id: number; fp_descripcion: string }[] =
      await this.dataSource.query(
        `SELECT fp.fp_id, fp.fp_descripcion
         FROM Formulario_pregunta fp
         JOIN Formulario_secciones fs ON fs.fs_id = fp.seccion_id
         WHERE fs.fs_nombre LIKE 'CONCEPTO DEL EJECUTIVO%' AND fp.fp_estado = 1
           AND ISNULL(fp.fp_version, 1) = @0`,
        [version],
      );
    if (!preguntas.length) {
      console.warn(
        '[guardarRespuestasConceptoEjecutivo] Sección CONCEPTO DEL EJECUTIVO sin preguntas; se omite.',
      );
      return;
    }
    const porDescripcion = (texto: string) =>
      preguntas.find(
        (p) =>
          p.fp_descripcion.trim().replace(/:$/, '').toUpperCase() ===
          texto.toUpperCase(),
      );

    const nombrePregunta = porDescripcion('Ejecutivo de negocios');
    if (nombrePregunta) {
      const [usr] = await this.dataSource.query(
        `SELECT usr_nombre FROM usuarios WHERE usr_id = @0`,
        [usuario_modifica],
      );
      if (usr?.usr_nombre) {
        await this.upsertRespuestaFormulario(
          this.dataSource,
          sa_sol_id,
          nombrePregunta.fp_id,
          { texto: usr.usr_nombre },
          usuario_modifica,
        );
      }
    }

    const consumoPregunta = porDescripcion('Consumo mes proyectado');
    if (consumoPregunta && consumo_mensual_proyectado != null) {
      await this.upsertRespuestaFormulario(
        this.dataSource,
        sa_sol_id,
        consumoPregunta.fp_id,
        { numero: consumo_mensual_proyectado },
        usuario_modifica,
      );
    }

    const toneladasPregunta = porDescripcion('Toneladas mes proyectado');
    if (toneladasPregunta && toneladas_proyectadas != null) {
      await this.upsertRespuestaFormulario(
        this.dataSource,
        sa_sol_id,
        toneladasPregunta.fp_id,
        { numero: toneladas_proyectadas },
        usuario_modifica,
      );
    }

    const obsPregunta = porDescripcion('Observaciones adicionales');
    if (obsPregunta && observaciones) {
      await this.upsertRespuestaFormulario(
        this.dataSource,
        sa_sol_id,
        obsPregunta.fp_id,
        { texto: observaciones },
        usuario_modifica,
      );
    }
  }

  // La decisión del CC2 también se refleja como respuestas de la sección
  // "USO EXCLUSIVO DE CARTONERA NACIONAL S.A." del formulario (oculta al
  // cliente durante el diligenciamiento), para que aparezca diligenciada en
  // el formulario completo y su PDF. Las preguntas se resuelven por nombre
  // de sección + descripción para no depender de fp_ids fijos.
  private async guardarRespuestasUsoExclusivo(
    queryRunner: any,
    sa_sol_id: number,
    aprobado: boolean,
    usuario_modifica: number,
    condiciones?: { cupo?: number; plazoPago?: number; formaPago?: string },
  ) {
    const [solicitudActual] = await queryRunner.query(
      `SELECT sol_formulario_version FROM solicitudes WHERE sol_id = @0`,
      [sa_sol_id],
    );
    const version = solicitudActual?.sol_formulario_version ?? 1;

    const preguntas: {
      fp_id: number;
      fp_descripcion: string;
      fp_tipo: string;
    }[] = await queryRunner.query(
      `SELECT fp.fp_id, fp.fp_descripcion, fp.fp_tipo
       FROM Formulario_pregunta fp
       JOIN Formulario_secciones fs ON fs.fs_id = fp.seccion_id
       WHERE fs.fs_nombre LIKE 'USO EXCLUSIVO%' AND fp.fp_estado = 1
         AND ISNULL(fp.fp_version, 1) = @0`,
      [version],
    );
    if (!preguntas.length) {
      console.warn(
        '[guardarRespuestasUsoExclusivo] Sección USO EXCLUSIVO sin preguntas; se omite.',
      );
      return;
    }
    const porDescripcion = (texto: string) =>
      preguntas.find(
        (p) => p.fp_descripcion.trim().toUpperCase() === texto.toUpperCase(),
      );

    const upsert = (
      fp_id: number,
      valores: {
        texto?: string | null;
        numero?: number | null;
        opcionId?: number | null;
      },
    ) =>
      this.upsertRespuestaFormulario(
        queryRunner,
        sa_sol_id,
        fp_id,
        valores,
        usuario_modifica,
      );

    // DECISION (SELECT): opción Aprobado/Negado por su fpo_valor
    const decision = porDescripcion('DECISION');
    if (decision) {
      const [opcion] = await queryRunner.query(
        `SELECT fpo_id FROM Formulario_pregunta_opcion
         WHERE fpo_fp_id = @0 AND fpo_valor = @1 AND fpo_estado = 1`,
        [decision.fp_id, aprobado ? 'Aprobado' : 'Negado'],
      );
      if (opcion) await upsert(decision.fp_id, { opcionId: opcion.fpo_id });
    }

    // Nombre de quien aprueba (TEXTO): nombre real del usuario que decide
    const nombrePregunta = porDescripcion('Nombre de quien aprueba');
    if (nombrePregunta) {
      const [usr] = await queryRunner.query(
        `SELECT usr_nombre FROM usuarios WHERE usr_id = @0`,
        [usuario_modifica],
      );
      if (usr?.usr_nombre)
        await upsert(nombrePregunta.fp_id, { texto: usr.usr_nombre });
    }

    // Condiciones financieras: solo aplican si la decisión fue Aprobado
    if (aprobado && condiciones) {
      const cupoPregunta = porDescripcion('Cupo$');
      if (cupoPregunta && condiciones.cupo !== undefined) {
        await upsert(cupoPregunta.fp_id, { numero: condiciones.cupo });
      }

      const plazoPregunta = porDescripcion('Plazo de Pago');
      if (plazoPregunta && condiciones.plazoPago !== undefined) {
        await upsert(plazoPregunta.fp_id, {
          texto: String(condiciones.plazoPago),
        });
      }

      // Forma de pago (SELECT_TABLA sobre Forma_pago): guarda el fpg_id en
      // fr_valor_numero, igual que el resto de respuestas SELECT_TABLA
      const formaPregunta = porDescripcion('Forma de pago');
      if (formaPregunta && condiciones.formaPago) {
        const [fp] = await queryRunner.query(
          `SELECT fpg_id FROM Forma_pago WHERE fpg_nombre = @0`,
          [condiciones.formaPago],
        );
        if (fp) await upsert(formaPregunta.fp_id, { numero: fp.fpg_id });
      }
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
      const estadoRevision =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          'REVISION',
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
          estadoRevision!.id,
          etapaSiguiente.wet_id,
          resultadoPendiente.wee_id,
          usuario_modifica,
          sa_sol_id,
          'Tu solicitud se encuentra en revisión.',
        ],
      );

      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        {
          solicitudId: sa_sol_id,
          etapaId: etapaActualId,
          resultadoId: resultadoPendiente.wee_id,
          usuarioId: usuario_modifica,
          comentario: comentario || 'Revisión de Comité de Crédito 1',
        },
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
      const estadoResult =
        await this.solicitudEstadosService.obtenerEstadoPorCodigo(
          estadoCodigo,
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
        estadoResult!.id,
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
          fecha_estimada_inicio: h.fechaEstimadaInicio,
          fecha_estimada_etapa_anterior: h.fechaEstimadaEtapaAnterior,
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

      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        {
          solicitudId,
          etapaId: 3,
          resultadoId: 1,
          usuarioId,
          comentario:
            'Solicitud corregida por cliente - Resultado actualizado a PENDIENTE',
        },
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

      // Fuente única desde 2026-07-27: la Carta de Vinculación es un
      // Tipos_documentos con tdo_origen='CARTA_APROBACION' (antes vivía en
      // param_carta_pdf_vinculacion, tabla aparte con su propia pantalla —
      // ver migración 20260727_unificar_carta_vinculacion_en_tipos_documentos.sql).
      // TiposDocumentosService garantiza que a lo sumo una quede activa a la
      // vez (antes, con "TOP 1 ... WHERE cpv_activo=1" sin ORDER BY y más de
      // una fila activa, cuál se usaba de verdad era no determinista).
      const [plantillaCartaPDF] = await this.dataSource.query(
        `SELECT TOP 1 tdo_plantilla_contenido, tdo_encabezado_tipo, tdo_encabezado_imagen_url
         FROM Tipos_documentos
         WHERE tdo_origen = 'CARTA_APROBACION' AND tdo_estado = 1
         ORDER BY tdo_updated_at DESC`,
      );

      if (!plantillaCartaPDF) {
        console.warn(
          `⚠️ [enviarCartaVinculacionPorCorreo] Plantilla de carta (Tipos_documentos, origen CARTA_APROBACION) no encontrada`,
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

      let contenidoCarta = plantillaCartaPDF.tdo_plantilla_contenido;
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
        plantillaCartaPDF.tdo_encabezado_tipo === 'IMAGEN'
          ? plantillaCartaPDF.tdo_encabezado_imagen_url
          : null,
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

  // ===== Negrita/tamaño puntual dentro del texto de la carta — mismos
  // marcadores que guarda PlantillaEditor.tsx (**negrita**,
  // {{size:N}}...{{/size}}) para los tipos de documento con plantilla de
  // texto. Se porta acá (en vez de compartir código con el frontend, que
  // corre en el navegador) la misma segmentación en dos pasadas
  // (tamaño por-fuera, negrita por-dentro) que usa
  // palabrasConEstilosPdf/palabrasConNegritaPdf en carta-pdf.util.ts, para
  // que lo que el usuario ve en el editor coincida con el PDF real que se
  // envía por correo al aprobar. pdfkit no necesita el layout manual palabra
  // por palabra que hace el frontend: basta con dibujar cada tramo con
  // `continued: true` y dejar que el propio pdfkit haga el wrap de línea. =====
  private segmentarNegritaCarta(
    texto: string,
    boldPorDefecto: boolean,
  ): { contenido: string; bold: boolean; size?: number }[] {
    const tramos: { contenido: string; bold: boolean; size?: number }[] = [];
    for (const parte of texto.split(/(\*\*[^*]+\*\*)/g)) {
      if (!parte) continue;
      const esNegrita =
        parte.startsWith('**') && parte.endsWith('**') && parte.length > 4;
      const contenido = esNegrita ? parte.slice(2, -2) : parte;
      tramos.push({ contenido, bold: esNegrita || boldPorDefecto });
    }
    return tramos;
  }

  private segmentarEstilosCarta(
    texto: string,
  ): { contenido: string; bold: boolean; size?: number }[] {
    const tramos: { contenido: string; bold: boolean; size?: number }[] = [];
    const regexTamaño = /\{\{size:(\d+)\}\}([\s\S]*?)\{\{\/size\}\}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    const agregarTramo = (fragmento: string, size?: number) => {
      for (const tramo of this.segmentarNegritaCarta(fragmento, false)) {
        tramos.push(size != null ? { ...tramo, size } : tramo);
      }
    };

    while ((match = regexTamaño.exec(texto))) {
      if (match.index > cursor) agregarTramo(texto.slice(cursor, match.index));
      agregarTramo(match[2], Number(match[1]));
      cursor = match.index + match[0].length;
    }
    if (cursor < texto.length) agregarTramo(texto.slice(cursor));

    return tramos;
  }

  private dibujarTextoConEstilosCarta(
    doc: any,
    texto: string,
    opts: {
      fontSizeBase: number;
      boldBase: boolean;
      align: 'left' | 'justify';
      lineGap?: number;
    },
  ) {
    const tramos = this.segmentarEstilosCarta(texto);
    if (tramos.length === 0) return;
    doc.fillColor('#1a1a1a');
    tramos.forEach((tramo, i) => {
      doc
        .font(
          tramo.bold || opts.boldBase ? 'Helvetica-Bold' : 'Helvetica',
        )
        .fontSize(tramo.size ?? opts.fontSizeBase);
      doc.text(tramo.contenido, {
        continued: i < tramos.length - 1,
        align: opts.align,
        lineGap: opts.lineGap,
      });
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
      this.dibujarTextoConEstilosCarta(doc, bloque.texto, {
        fontSizeBase: 12,
        boldBase: true,
        align: 'left',
      });
      doc.moveDown(0.4);
    } else if (bloque.tipo === 'parrafo') {
      this.dibujarTextoConEstilosCarta(doc, bloque.texto, {
        fontSizeBase: 11,
        boldBase: false,
        align: 'justify',
        lineGap: 4,
      });
      doc.moveDown(0.7);
    } else {
      for (const linea of bloque.lineas) {
        this.dibujarTextoConEstilosCarta(doc, linea, {
          fontSizeBase: 11,
          boldBase: false,
          align: 'left',
          lineGap: 3,
        });
      }
      doc.moveDown(0.7);
    }
  }

  // Encabezado alternativo para documentos de Tipos_documentos con
  // tdo_encabezado_tipo='IMAGEN': una imagen que el usuario sube desde
  // parametrizacion/documentos, dibujada tal cual arriba de cada página, en
  // vez del membrete de texto fijo "CARTONERA NACIONAL S.A." / la tabla
  // completa de "formato oficial" (esa sigue sin implementarse en el
  // backend — ver comentario en TipoDocumento.encabezadoTipo). Alto fijo
  // (no se calcula del tamaño real de la imagen) para que el resto del
  // layout sea predecible sin importar la proporción de la imagen subida:
  // pdfkit la encoge/centra dentro de esa caja con `fit`, nunca se sale.
  private dibujarEncabezadoImagenCarta(doc: any, imagenBuffer: Buffer) {
    const marginLeft = 50;
    const anchoContenido = 495;
    const altoCaja = 80;
    doc.image(imagenBuffer, marginLeft, doc.y, {
      fit: [anchoContenido, altoCaja],
      align: 'center',
    });
    doc.y += altoCaja + 14;
  }

  private async obtenerImagenEncabezadoCarta(
    url: string | null | undefined,
  ): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) {
        throw new Error(`HTTP ${respuesta.status}`);
      }
      const arrayBuffer = await respuesta.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(
        `⚠️ [obtenerImagenEncabezadoCarta] No se pudo descargar la imagen de encabezado (${url}):`,
        error,
      );
      return null;
    }
  }

  private async generarPDFCarta(
    contenidoCarta: string,
    numeroSolicitud: string,
    clienteNombre?: string,
    encabezadoImagenUrl?: string | null,
  ): Promise<Buffer> {
    const imagenEncabezado = await this.obtenerImagenEncabezadoCarta(
      encabezadoImagenUrl,
    );

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

        if (imagenEncabezado) {
          // Se repite en cada página nueva que agregue pdfkit por
          // desbordamiento de texto — sin esto, solo la primera página
          // tendría encabezado.
          doc.on('pageAdded', () =>
            this.dibujarEncabezadoImagenCarta(doc, imagenEncabezado),
          );
          this.dibujarEncabezadoImagenCarta(doc, imagenEncabezado);
        } else {
          // Membrete de texto — el de siempre, cuando el documento no tiene
          // imagen de encabezado configurada (tdo_encabezado_tipo='NINGUNO').
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
        }

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
