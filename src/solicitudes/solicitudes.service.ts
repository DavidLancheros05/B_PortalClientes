// src/solicitudes/solicitudes.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { addBusinessDays } from '../common/utils/business-days.util';
import { obtenerVersionFormularioActivo } from '../common/utils/formulario-activo.util';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';
import { FormularioRenderizableService } from './formulario-renderizable.service';
import { MailService } from '../mail/mail.service';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { WorkflowEtapaResponseDto } from './dto/workflow-etapa.response.dto';
import { WorkflowResultadoResponseDto } from './dto/workflow-resultado.response.dto';
import { ParamDiasRespuestaResponseDto } from './dto/param-dias-respuesta.response.dto';
import {
  ENCABEZADO_ALTURA,
  dibujarEncabezadoOficialPdf,
  dibujarTablaRevisionesPdf,
  obtenerLogoBytes,
  esPng,
} from '../common/utils/encabezado-oficial-pdf.util';

@Injectable()
export class SolicitudesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notificacionesService: NotificacionesService,
    private readonly historialWorkflowService: HistorialWorkflowService,
    private readonly formularioRenderizableService: FormularioRenderizableService,
    private readonly mailService: MailService,
  ) {}

  // Un EJECUTIVO solo puede crear/gestionar solicitudes de los clientes que
  // tiene asignados (Clientes.ejng_id) — mismo criterio que ya filtra el
  // listado en solicitudes-listados.service.ts.
  async clienteEsDelEjecutivo(
    clienteId: number,
    ejngId: number,
  ): Promise<boolean> {
    const result = await this.dataSource.query(
      `SELECT 1 FROM clientes WHERE cli_id = @0 AND ejng_id = @1`,
      [clienteId, ejngId],
    );
    return result.length > 0;
  }

  // El esquema no cambia en caliente (solo con una migración + redeploy), así
  // que esta introspección solo necesita correr una vez por proceso en vez
  // de en cada crearSolicitud().
  private historialColumnsCache: Record<string, string> | undefined;

  private async resolveHistorialColumns() {
    if (this.historialColumnsCache) return this.historialColumnsCache;

    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_sol_id') IS NOT NULL THEN 'seh_sol_id' ELSE 'sa_sol_id' END AS solicitud_col,
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_estado_id') IS NOT NULL THEN 'seh_estado_id' ELSE 'estado_id' END AS estado_col,
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_usr_id') IS NOT NULL THEN 'seh_usr_id' ELSE 'usr_id' END AS usuario_col,
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_fecha_hora') IS NOT NULL THEN 'seh_fecha_hora' ELSE 'fecha_hora' END AS fecha_col
    `);

    this.historialColumnsCache = result[0];
    return this.historialColumnsCache;
  }

  async crearSolicitud(body: any) {


    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {

      const clienteId = body.cliente_id || body.solicitud?.cliente_id;

      if (!clienteId) {
        throw new Error('Falta cliente_id');
      }

      // Validaciones baratas antes de consumir el consecutivo o consultar
      // el calendario hábil.
      const estadoId = Number(body.estado_id);
      if (estadoId !== 1 && estadoId !== 2) {
        throw new Error(
          `estado_id inválido para crear una solicitud: ${body.estado_id} (debe ser 1=BORRADOR o 2=PENDIENTE).`,
        );
      }

      // UPDLOCK sobre la fila del cliente serializa las creaciones
      // concurrentes del mismo cliente (doble clic en "Enviar"): la segunda
      // espera al commit de la primera y ya ve su solicitud en trámite.
      const clienteResult = await queryRunner.query(
        `SELECT ejng_id FROM clientes WITH (UPDLOCK, ROWLOCK) WHERE cli_id = @0`,
        [clienteId],
      );
      if (clienteResult.length === 0) {
        throw new Error(`No existe el cliente ${clienteId}`);
      }
      const ejecutivoId = clienteResult[0].ejng_id || null;

      // Estados "en trámite" por código (llave estable del flujo); el nombre
      // que ve el usuario sale de solicitud_estados.
      const [solicitudEnTramite] = await queryRunner.query(
        `SELECT TOP 1 s.sol_numero, se.ses_nombre
         FROM solicitudes s
         JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
         WHERE s.sol_cli_id = @0
           AND se.ses_codigo IN ('BORRADOR', 'PENDIENTE', 'REVISION')
         ORDER BY s.sol_id DESC`,
        [clienteId],
      );

      if (solicitudEnTramite) {
        throw new Error(
          `El cliente ya tiene una solicitud en estado ${solicitudEnTramite.ses_nombre} (No. ${solicitudEnTramite.sol_numero}). Complétala o resuélvela antes de crear una nueva.`,
        );
      }

      // Generar número único del consecutivo
      const numeroSolicitud =
        await this.obtenerSiguienteNumeroSolicitud(queryRunner);
      const now = new Date();

      // Días por etapa unidos por wet_id (no por el nombre del área, que se
      // edita en parametrización) y calendario hábil desde BD. Sin
      // defaults: si falta cualquier dato, revienta.
      const dias = await this.historialWorkflowService.obtenerDiasRespuestaPorEtapa(
        queryRunner,
        ['EJN', 'ASC', 'OFC', 'CC1', 'CC2'],
      );
      const { festivos, diasNoHabilesSemana } =
        await this.historialWorkflowService.cargarCalendarioHabil(queryRunner);

      // Encadenadas: cada etapa asume que la anterior se resolvió justo a
      // tiempo, no que todas arrancan el mismo día de creación (si no, dos
      // etapas con el mismo plazo configurado caen en la misma fecha).
      const fechaEstimadaEjecutivo = addBusinessDays(
        now,
        dias.EJN,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaAuxiliar = addBusinessDays(
        fechaEstimadaEjecutivo,
        dias.ASC,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaOficial = addBusinessDays(
        fechaEstimadaAuxiliar,
        dias.OFC,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaCC1 = addBusinessDays(
        fechaEstimadaOficial,
        dias.CC1,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaCC2 = addBusinessDays(
        fechaEstimadaCC1,
        dias.CC2,
        festivos,
        diasNoHabilesSemana,
      );

      const formularioVersion =
        await obtenerVersionFormularioActivo(queryRunner);

      const insertSolicitudSQL = `
        INSERT INTO solicitudes (
          sol_cli_id, sol_ses_id,
          sol_fecha_creacion, sol_created_at,
          sol_updated_at, sol_version, sol_formulario_version, sol_usr_id_crea,
          sol_numero,
          sol_ejng_id, sol_fecha_envio,
          sol_fecha_est_gest_ejn, sol_fecha_est_gest_asc,
          sol_fecha_est_gest_oc, sol_fecha_est_gest_cc1,
          sol_fecha_est_gest_cc2,
          sol_mrs_id, sol_usr_id_modifica,
          sol_wet_id, sol_wee_id, sol_observacion_cliente
        ) VALUES (
          @0, @1, @2, @3,
          @4, @5, @6, @7, @8,
          @9, @10, @11, @12, @13, @14,
          @15, @16, @17, @18, @19, @20
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

      const fechaEnvio = estadoId === 2 ? now : null; // Si es PENDIENTE, establecer fecha de envío


      let documentosDiferidosFaltantes: {
        tdo_id: number;
        tdo_nombre: string;
      }[] = [];
      if (estadoId === 2) {

        documentosDiferidosFaltantes = await queryRunner.query(
          `
          SELECT DISTINCT td.tdo_id, td.tdo_nombre
          FROM Formulario_pregunta fp
          JOIN Tipos_documentos td ON td.tdo_id = fp.fp_tdo_id
          LEFT JOIN Formulario_secciones fs ON fs.fs_id = fp.seccion_id
          WHERE fp.fp_estado = 1
            AND td.tdo_tiene_plantilla = 1
            AND (fp.fp_oculto_en_formulario = 1 OR fs.fs_oculta_en_formulario = 1)
            AND ISNULL(fp.fp_version, 1) = @0
            AND (td.tdo_solo_distribuidor = 0 OR EXISTS (
              SELECT 1 FROM Clientes c WHERE c.cli_id = @1 AND c.cli_es_distribuidor = 1
            ))
          `,
          [formularioVersion, clienteId],
        );
      }
      const hayDocumentosDiferidos = documentosDiferidosFaltantes.length > 0;

      let resultadoFinalId = resultadoPdId;
      if (hayDocumentosDiferidos) {
        const [resultadoPendDocs] = await queryRunner.query(
          `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PEND_FIRMA'`,
        );
        if (!resultadoPendDocs) {
          throw new Error(
            "No existe el resultado 'PEND_FIRMA' en workflow_estado_etapa.",
          );
        }
        resultadoFinalId = resultadoPendDocs.wee_id;
      }

      // 5.1 Determinar etapa inicial según el estado
      // BORRADOR (1) → CLI, PENDIENTE (2) → EJN (o CLI si faltan documentos diferidos)
      const etapaActualId =
        estadoId === 1 || hayDocumentosDiferidos ? etapaClienteId : etapaCenId;

      // Texto que ve el cliente en su listado de solicitudes (columna
      // Observaciones), igual que en cambiarEstado().
      const observacionClienteInicial =
        estadoId === 1
          ? 'Puedes terminar de modificar tu formulario cuando lo desees.'
          : hayDocumentosDiferidos
            ? 'Faltan subir documentos firmados y enviar.'
            : 'Formulario y documentos cargados correctamente. Puedes editar hasta que Cartonera revise tu solicitud.';

      // 5.1 Parámetros en ARRAY en el ORDEN CORRECTO
      const solicitudParams = [
        // Campos NOT NULL
        clienteId, // @0
        estadoId, // @1 estado_id (1=BORRADOR, 2=PENDIENTE, 3=REVISIÓN, 4=COMPLETADA)

        // Fechas
        now, // @2 fecha_creacion
        now, // @3 created_at
        now, // @4 updated_at

        // Versiones
        1, // @5 version
        formularioVersion, // @6 formulario_version

        // Usuario (puede ser NULL si es un cliente)
        body.usuario_crea || null, // @7 usuario_crea

        // Número de solicitud (zona franca ya no se guarda aquí: vive en la
        // respuesta USUARIO_ZONA_FRANCA del formulario)
        numeroSolicitud, // @8 numero_solicitud

        // ejecutivo_id heredado del cliente
        ejecutivoId, // @9 ejecutivo_id
        fechaEnvio, // @10 fecha_envio (now si estado_id=2, null si estado_id=1)

        // Fechas estimadas para cada etapa del workflow
        fechaEstimadaEjecutivo, // @11 sol_fecha_est_gest_ejn
        fechaEstimadaAuxiliar, // @12 sol_fecha_est_gest_asc
        fechaEstimadaOficial, // @13 sol_fecha_est_gest_oc
        fechaEstimadaCC1, // @14 sol_fecha_est_gest_cc1
        fechaEstimadaCC2, // @15 sol_fecha_est_gest_cc2

        null, // @16 motivo_rechazo_id
        null, // @17 usuario_modifica
        etapaActualId, // @18 sol_wet_id (CLI si BORRADOR, EJN si PENDIENTE)
        resultadoFinalId, // @19 sol_wee_id (PENDIENTE, o PEND_FIRMA si faltan documentos diferidos)
        observacionClienteInicial, // @20 sol_observacion_cliente
      ];

      const solicitudResult = await queryRunner.query(
        insertSolicitudSQL,
        solicitudParams,
      );
      const solicitudId = solicitudResult[0]?.sol_id;

      if (!solicitudId) {
        throw new Error('No se obtuvo ID de la solicitud');
      }

 
      // 6. Registrar en historial de estados
      const histCols = await this.resolveHistorialColumns();
      const historialSQL = `
        INSERT INTO Solicitudes_estados_hist
        (${histCols.solicitud_col}, ${histCols.estado_col}, ${histCols.usuario_col}, ${histCols.fecha_col})
        VALUES (@0, @1, @2, GETDATE())
      `;
      // seh_usr_id / swh_usuario_id son NOT NULL: cuando crea un cliente
      // (usuario_crea = null) se usa 1, igual que cambiarEstado().
      const usuarioHistorial = body.usuario_crea ?? 1;
      await queryRunner.query(historialSQL, [
        solicitudId,
        estadoId,
        usuarioHistorial,
      ]);

      if (estadoId !== 1) {
        const etapaTransicion = estadoId === 2 ? etapaActualId : null;
        const mensajeTransicion = hayDocumentosDiferidos
          ? 'Solicitud registrada: faltan subir documentos firmados y enviar.'
          : 'Solicitud enviada a Ejecutivo de Negocios';
        if (etapaTransicion) {
          await this.historialWorkflowService.registrarTransicionConSLA(
            queryRunner,
            {
              solicitudId,
              etapaId: etapaTransicion,
              resultadoId: resultadoFinalId,
              usuarioId: usuarioHistorial,
              comentario: mensajeTransicion,
            },
          );
        }
      } else {
        console.log(
          'Estado BORRADOR: No se registra en workflow_historial (solo en estados_hist)',
        );
      }

      // 7. Insertar respuestas (también con parámetros nombrados)
      if (body.respuestas?.length > 0) {

        for (const respuesta of body.respuestas) {
          const insertRespuestaSQL = `
            INSERT INTO Formulario_respuesta
            (fr_sol_id, fr_fp_id, fr_valor_texto, fr_valor_numero, fr_valor_fecha, fr_valor_opcion_id, fr_created_at)
            VALUES (@0, @1, @2, @3, @4, @5, @6)
          `;

          const respuestaParams = [
            solicitudId, // @0
            respuesta.fp_id, // @1
            // ?? y no ||: una respuesta numérica 0 es válida y no debe
            // quedar como NULL ("Sin respuesta").
            respuesta.valor_texto || null, // @2
            respuesta.valor_numero ?? null, // @3
            respuesta.valor_fecha || null, // @4
            respuesta.valor_opcion_id ?? null, // @5
            now, // @6
          ];

          await queryRunner.query(insertRespuestaSQL, respuestaParams);
        }
      }

      // 8. Commit
      await queryRunner.commitTransaction();

      if (estadoId === 2 && !hayDocumentosDiferidos) {
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
      }

      return {
        ok: true,
        sa_sol_id: solicitudId,
        numero_solicitud: numeroSolicitud,
        documentosDiferidosFaltantes,
        mensaje: 'Solicitud creada exitosamente con SQL directo',
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error en SQL directo:', error.message);
      console.error('❌ Stack:', error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ===== MÉTODOS ADICIONALES =====

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
    } catch (error: any) {
      return {
        ok: false,
        conectado: false,
        error: error.message,
      };
    }
  }

  async generarPdfSolicitud(
    solicitudId: number,
    tdoId?: number,
  ): Promise<Buffer> {
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

      // Una sección con todas sus preguntas ocultas no se imprime (antes
      // quedaba solo la barra de título azul, sin nada debajo).
      secciones = seccionesInfo
        .map((s: any) => ({
          seccion_id: s.seccion_id,
          seccion_nombre: s.seccion_nombre,
          seccion_orden: s.seccion_orden,
          preguntas: seccionesMap.get(s.seccion_id)?.preguntas || [],
        }))
        .filter((s: any) => s.preguntas.length > 0);
    }

    const tipoDocumentoFormatoRows = await this.dataSource.query(
      `
      SELECT TOP 1 tdo_id, tdo_nombre, tdo_formato_codigo, tdo_formato_codigo_secundario, tdo_revision, tdo_encabezado_imagen_url
      FROM Tipos_documentos
      WHERE tdo_tipo_plantilla = 'PDF_SOLICITUD' AND tdo_estado = 1
        AND (@0 IS NULL OR tdo_id = @0)
      ORDER BY tdo_id
    `,
      [tdoId ?? null],
    );
    const tipoDocumentoFormato = tipoDocumentoFormatoRows[0] ?? null;

    // Historial de revisiones ("CONTROL DE CAMBIOS") configurado para ese
    // mismo tipo de documento — se dibuja una sola vez, al final del cuerpo.
    const revisionesRows = tipoDocumentoFormato
      ? await this.dataSource.query(
          `SELECT tdr_revision, tdr_descripcion_cambio, tdr_fecha
           FROM Tipos_documentos_revisiones
           WHERE tdr_tdo_id = @0 AND tdr_estado = 1
           ORDER BY tdr_orden, tdr_fecha`,
          [tipoDocumentoFormato.tdo_id],
        )
      : [];
    const revisionesDocumento = revisionesRows.map((r: any) => ({
      revision: r.tdr_revision,
      descripcionCambio: r.tdr_descripcion_cambio,
      // Columna `date`: llega como medianoche UTC, formatear en UTC o se
      // corre un día si el proceso no corre en UTC.
      fecha: new Date(r.tdr_fecha).toLocaleDateString('es-CO', {
        timeZone: 'UTC',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    }));

    const pdfDoc = await PDFDocument.create();
    const logoBytes = await obtenerLogoBytes(
      tipoDocumentoFormato?.tdo_encabezado_imagen_url,
    );
    const logoImage = esPng(logoBytes)
      ? await pdfDoc.embedPng(logoBytes)
      : await pdfDoc.embedJpg(logoBytes);
    const helvetica = await pdfDoc.embedFont('Helvetica');
    const helveticaBold = await pdfDoc.embedFont('Helvetica-Bold');

    const pageWidth = 595;
    const pageHeight = 842;
    const marginLeft = 40;
    const marginRight = 40;
    const marginTop = 30;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const headerTopY = pageHeight - marginTop;
    const bodyTopY = headerTopY - ENCABEZADO_ALTURA - 15;

    // Todas las páginas quedan registradas acá para poder dibujarles el
    // encabezado oficial al final, una vez que se sabe el total real de
    // páginas (igual criterio que generarFormatoOficialPdf en el frontend).
    const paginas: PDFPage[] = [];
    const nuevaPagina = (): PDFPage => {
      const pagina = pdfDoc.addPage([pageWidth, pageHeight]);
      paginas.push(pagina);
      return pagina;
    };

    let currentPage = nuevaPagina();
    let yPos = bodyTopY;

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
      font: PDFFont = helvetica,
    ): string[] => {
      // Una "palabra" más ancha que maxWidth (correo, URL, número largo sin
      // espacios) se parte por caracteres; si no, se sale de su columna.
      const partirPalabra = (palabra: string): string[] => {
        if (font.widthOfTextAtSize(palabra, fontSize) <= maxWidth) {
          return [palabra];
        }
        const trozos: string[] = [];
        let trozo = '';
        for (const caracter of palabra) {
          if (
            trozo &&
            font.widthOfTextAtSize(trozo + caracter, fontSize) > maxWidth
          ) {
            trozos.push(trozo);
            trozo = caracter;
          } else {
            trozo += caracter;
          }
        }
        if (trozo) trozos.push(trozo);
        return trozos;
      };

      const words = String(text)
        .split(/\s+/)
        .filter(Boolean)
        .flatMap(partirPalabra);
      const lines: string[] = [];
      let currentLine = '';

      for (const word of words) {
        const tentativa = currentLine ? `${currentLine} ${word}` : word;
        if (
          currentLine &&
          font.widthOfTextAtSize(tentativa, fontSize) > maxWidth
        ) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = tentativa;
        }
      }
      if (currentLine) lines.push(currentLine);
      return lines;
    };

    // Dibuja una línea de texto justificada (repartiendo el espacio extra
    // entre palabras para que llegue exacto a maxWidth). La última línea de
    // un párrafo no se justifica (queda alineada a la izquierda, como es
    // convención tipográfica estándar).
    const drawJustifiedLine = (
      page: PDFPage,
      line: string,
      x: number,
      y: number,
      maxWidth: number,
      fontSize: number,
      font: PDFFont,
      color: ReturnType<typeof rgb>,
      justificar: boolean,
    ) => {
      const palabras = line.split(' ').filter(Boolean);

      if (!justificar || palabras.length <= 1) {
        page.drawText(line, { x, y, size: fontSize, font, color });
        return;
      }

      const spaceWidth = font.widthOfTextAtSize(' ', fontSize);
      const palabrasWidth = palabras.reduce(
        (suma, palabra) => suma + font.widthOfTextAtSize(palabra, fontSize),
        0,
      );
      const anchoNatural = palabrasWidth + spaceWidth * (palabras.length - 1);
      const espacioExtra = Math.max(0, maxWidth - anchoNatural);
      const espacioPorHueco = espacioExtra / (palabras.length - 1);

      let cursorX = x;
      palabras.forEach((palabra) => {
        page.drawText(palabra, { x: cursorX, y, size: fontSize, font, color });
        cursorX +=
          font.widthOfTextAtSize(palabra, fontSize) +
          spaceWidth +
          espacioPorHueco;
      });
    };

    // ===== TABLA DE SECCIONES =====
    for (const seccion of secciones) {
      // Título de sección: se dibuja siempre en la posición actual, sin
      // revisar si queda algo de la sección debajo — antes podía terminar
      // solo al final de una hoja (con toda la hoja vacía debajo) y la
      // primera pregunta real de la sección se empujaba a la siguiente.
      // No se conoce de antemano la altura exacta de esa primera pregunta
      // (depende de su tipo, calculado más abajo), así que se exige un
      // colchón fijo generoso en vez de calcularla aquí.
      if (yPos - 18 - 15 < 100 + 40) {
        currentPage = nuevaPagina();
        yPos = bodyTopY;
      }

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

      // Clasificar cada pregunta según cómo se renderiza, y agrupar en
      // tramos de preguntas CONSECUTIVAS del mismo tipo — preservando el
      // fp_orden real de la sección (`seccion.preguntas` ya viene ordenado
      // así desde formulario-renderizable.service.ts). Antes se armaban 5
      // baldes GLOBALES (todas las NOTA, todas las TABLA, etc. de la
      // sección completa) y se dibujaba balde por balde en un orden fijo
      // sin importar la posición real de cada pregunta — por eso una
      // pregunta normal como "¿Solicitud de Credito?" terminaba impresa
      // DESPUÉS de las tablas "Referencia Comercial"/"Referencia Bancaria"
      // que en el formulario dependen de ella, solo porque el código
      // dibujaba siempre todas las TABLA antes que todas las NORMAL.
      type TipoRenderPregunta =
        | 'NOTA'
        | 'TABLA'
        | 'IMAGEN'
        | 'ESPACIO_FIRMA'
        | 'NORMAL';
      const clasificarPregunta = (preg: any): TipoRenderPregunta => {
        if (preg.fp_tipo === 'NOTA') return 'NOTA';
        if (
          preg.fp_tipo === 'TABLA' &&
          Array.isArray(preg.tabla_columnas) &&
          preg.tabla_columnas.length > 0 &&
          Array.isArray(preg.tabla_filas) &&
          preg.tabla_filas.length > 0
        ) {
          return 'TABLA';
        }
        if (preg.fp_tipo === 'IMAGEN' && preg.imagen_ruta) return 'IMAGEN';
        if (preg.fp_tipo === 'ESPACIO_FIRMA') return 'ESPACIO_FIRMA';
        return 'NORMAL';
      };
      const tramos: { tipo: TipoRenderPregunta; items: any[] }[] = [];
      for (const preg of seccion.preguntas) {
        const tipo = clasificarPregunta(preg);
        const ultimoTramo = tramos[tramos.length - 1];
        if (ultimoTramo && ultimoTramo.tipo === tipo) {
          ultimoTramo.items.push(preg);
        } else {
          tramos.push({ tipo, items: [preg] });
        }
      }

      // Si la descripción de la pregunta ya trae ":" al final (dato así
      // cargado en Formulario_pregunta.fp_descripcion, ej. "Actividad
      // Economica:"), no hay que agregarle otro — antes se concatenaba
      // siempre sin revisar, y esas preguntas terminaban mostrando
      // "Actividad Economica::" con dos puntos pegados.
      const conDosPuntos = (texto: string): string =>
        texto.trim().endsWith(':') ? texto : `${texto}:`;

      // Renderizar una NOTA a ancho completo. Igual que en pantalla
      // (getNotaDisplay en el frontend): fp_descripcion + fp_descripcion_adicional
      // se combinan y se parten por línea en título / subtítulo / cuerpo — el
      // cuerpo es lo único que se justifica (el título/subtítulo son
      // encabezados cortos, no párrafos).
      const notaTextWidth = contentWidth - 16;
      const renderNota = (notaPregunta: any) => {
        const descripcionNota = String(
          notaPregunta.fp_descripcion || '',
        ).trim();
        const descripcionAdicionalNota = String(
          notaPregunta.fp_descripcion_adicional || '',
        ).trim();

        // El editor de preguntas solo permite escribir fp_descripcion (no
        // tiene campo propio para fp_descripcion_adicional) — el caso
        // normal es un único bloque de texto, que puede traer varios
        // párrafos separados por línea en blanco escritos por el autor, y
        // se muestra completo como cuerpo (el bloque de abajo ya divide el
        // cuerpo por '\n' y dibuja cada párrafo aparte). Solo si además hay
        // una descripción adicional configurada por otra vía, la pregunta
        // actúa como título corto y la adicional como cuerpo (mismo
        // criterio que getNotaDisplay en el frontend).
        let notaTitulo = '';
        let notaSubtitulo = '';
        let notaCuerpo = '';

        if (descripcionAdicionalNota) {
          notaTitulo = descripcionNota;
          notaCuerpo = descripcionAdicionalNota;
        } else {
          notaCuerpo = descripcionNota;
        }

        const tituloLinesNota = wrapText(
          notaTitulo,
          notaTextWidth,
          9,
          helveticaBold,
        );
        const subtituloLinesNota = notaSubtitulo
          ? wrapText(notaSubtitulo, notaTextWidth, 8, helveticaBold)
          : [];
        const parrafosCuerpo = notaCuerpo
          .split('\n')
          .map((parrafo) => parrafo.trim())
          .filter(Boolean)
          .map((parrafo) => wrapText(parrafo, notaTextWidth, 8, helvetica));
        const cuerpoLineCount = parrafosCuerpo.reduce(
          (suma, parrafo) => suma + parrafo.length,
          0,
        );
        const espacioEntreParrafos = Math.max(0, parrafosCuerpo.length - 1) * 3;

        const notaBoxHeight =
          tituloLinesNota.length * 10 +
          (subtituloLinesNota.length ? subtituloLinesNota.length * 9 + 2 : 0) +
          (cuerpoLineCount ? cuerpoLineCount * 9 + 4 : 0) +
          espacioEntreParrafos +
          10;

        // Si la nota completa (título + cuerpo) no cabe en lo que queda de
        // página, saltar a una nueva ANTES de dibujar — de lo contrario la
        // caja se dibuja igual en la posición actual y termina escribiendo
        // hasta el borde inferior (o pasándose) de la página actual.
        if (yPos - notaBoxHeight < 100) {
          currentPage = nuevaPagina();
          yPos = bodyTopY;
        }

        // Caja para la nota
        drawBox(
          marginLeft,
          yPos,
          contentWidth,
          notaBoxHeight,
          rgb(0.93, 0.96, 1),
          rgb(0.75, 0.83, 0.92),
        );

        let currentY = yPos - 10;

        for (const line of tituloLinesNota) {
          currentPage.drawText(line, {
            x: marginLeft + 8,
            y: currentY,
            size: 9,
            font: helveticaBold,
            color: rgb(0, 0.16, 0.45),
          });
          currentY -= 10;
        }

        if (subtituloLinesNota.length) {
          currentY -= 2;
          for (const line of subtituloLinesNota) {
            currentPage.drawText(line, {
              x: marginLeft + 8,
              y: currentY,
              size: 8,
              font: helveticaBold,
              color: rgb(0, 0.239, 0.6),
            });
            currentY -= 9;
          }
        }

        if (cuerpoLineCount) {
          currentY -= 4;
          parrafosCuerpo.forEach((lineasParrafo, parrafoIdx) => {
            lineasParrafo.forEach((line, idx) => {
              const esUltimaLineaParrafo = idx === lineasParrafo.length - 1;
              drawJustifiedLine(
                currentPage,
                line,
                marginLeft + 8,
                currentY,
                notaTextWidth,
                8,
                helvetica,
                rgb(0.3, 0.3, 0.3),
                !esUltimaLineaParrafo,
              );
              currentY -= 9;
            });
            if (parrafoIdx < parrafosCuerpo.length - 1) currentY -= 3;
          });
        }

        // +12 (no +8) para igualar el espacio que deja renderNormales
        // después de una fila de preguntas — con +8 la nota quedaba visto
        // más pegada a lo que sigue que el resto del formulario.
        yPos -= notaBoxHeight + 12;

        // Nueva página si es necesario
        if (yPos < 100) {
          currentPage = nuevaPagina();
          yPos = bodyTopY;
        }
      };

      // Renderizar una pregunta TABLA como grilla real (una fila = un registro)
      const renderTabla = (tablaPregunta: any) => {
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
          helveticaBold,
        );

        // La pregunta y su tabla forman una sola unidad visual. Reservar
        // título + encabezado + primera fila antes de dibujar cualquiera de
        // ellos evita dejar "Tabla de contactos" al final de una página y
        // enviar la tabla real a la siguiente.
        const filasConLineas = filas.map((fila) =>
          columnas.map((columna) =>
            wrapText(
              String(fila[columna] ?? ''),
              colWidth - cellPaddingX * 2,
              fontSize,
            ),
          ),
        );
        const alturaPrimeraFila =
          filasConLineas.length > 0
            ? Math.max(...filasConLineas[0].map((lineas) => lineas.length), 1) *
                9 +
              6
            : 0;
        const alturaInicialTabla =
          tituloLines.length * 11 + 3 + 14 + alturaPrimeraFila;
        if (yPos - alturaInicialTabla < 100) {
          currentPage = nuevaPagina();
          yPos = bodyTopY;
        }

        for (const line of tituloLines) {
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

        const dibujarEncabezado = () => {
          if (yPos < 100) {
            currentPage = nuevaPagina();
            yPos = bodyTopY;
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
            currentPage = nuevaPagina();
            yPos = bodyTopY;
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

        // +12 (no +10), igual que renderNota y renderNormales — con +10
        // la tabla quedaba más pegada a lo que sigue que el resto del
        // formulario.
        yPos -= 12;
      };

      // Renderizar preguntas IMAGEN embebiendo la imagen real en el PDF,
      // dos por fila (p.ej. logo y firma quedan uno al lado del otro)
      const imagenColWidth = contentWidth / 2;
      const imagenColGap = 16;
      const imagenMaxWidth = imagenColWidth - imagenColGap;
      const imagenMaxHeight = 90;

      const renderImagenesPar = async (par: any[]) => {
        // Pre-cargar/embeber ambas imágenes de la fila antes de dibujar,
        // para poder calcular la altura real de la fila de antemano.
        const items = await Promise.all(
          par.map(async (imagenPregunta) => {
            const tituloLines = wrapText(
              String(imagenPregunta.fp_descripcion),
              imagenMaxWidth,
              9,
              helveticaBold,
            );
            try {
              // Timeout para que un storage que no responde no deje colgada
              // la generación del PDF.
              const respuestaImagen = await axios.get(
                imagenPregunta.imagen_ruta,
                { responseType: 'arraybuffer', timeout: 10000 },
              );
              const bytes = Buffer.from(respuestaImagen.data);
              // Formato por los bytes reales, no por el MIME guardado (un
              // PNG renombrado a .jpg reventaba en embedJpg).
              const embeddedImage = esPng(bytes)
                ? await pdfDoc.embedPng(bytes)
                : await pdfDoc.embedJpg(bytes);

              const scale = Math.min(
                imagenMaxWidth / embeddedImage.width,
                imagenMaxHeight / embeddedImage.height,
                1,
              );
              return {
                tituloLines,
                embeddedImage,
                imgWidth: embeddedImage.width * scale,
                imgHeight: embeddedImage.height * scale,
                error: false,
              };
            } catch (err) {
              console.error(
                `❌ Error embebiendo imagen para pregunta ${imagenPregunta.fp_id}:`,
                err,
              );
              return {
                tituloLines,
                embeddedImage: null,
                imgWidth: 0,
                imgHeight: 0,
                error: true,
              };
            }
          }),
        );

        const rowHeight =
          Math.max(...items.map((it) => it.tituloLines.length * 11 + 3)) +
          Math.max(...items.map((it) => it.imgHeight));

        if (yPos - rowHeight < 100) {
          currentPage = nuevaPagina();
          yPos = bodyTopY;
        }

        const rowTopY = yPos;
        const maxImgHeight = Math.max(...items.map((it) => it.imgHeight));

        items.forEach((item, idx) => {
          const colX = marginLeft + idx * imagenColWidth;
          // La imagen va arriba, alineada por abajo con la más alta del
          // par, y el nombre del campo (p.ej. "Firma representante legal")
          // queda debajo, a modo de leyenda.
          const colY = rowTopY - (maxImgHeight - item.imgHeight);

          if (item.error) {
            currentPage.drawText('(No se pudo cargar la imagen)', {
              x: colX,
              y: colY - item.imgHeight,
              size: 8,
              font: helvetica,
              color: rgb(0.6, 0.2, 0.2),
            });
          } else if (item.embeddedImage) {
            currentPage.drawImage(item.embeddedImage, {
              x: colX,
              y: colY - item.imgHeight,
              width: item.imgWidth,
              height: item.imgHeight,
            });
          }

          let leyendaY = rowTopY - maxImgHeight - 12;
          for (const line of item.tituloLines) {
            currentPage.drawText(line, {
              x: colX,
              y: leyendaY,
              size: 9,
              font: helveticaBold,
              color: rgb(0, 0.239, 0.6),
            });
            leyendaY -= 11;
          }
        });

        yPos -= rowHeight + 12;
      };

      // Renderizar preguntas ESPACIO_FIRMA como un área en blanco con leyenda
      // debajo (mismo layout de 2 por fila que las imágenes), para que el
      // cliente la firme a mano tras imprimir/descargar el PDF
      const espacioLineHeight = 14;
      const renderEspacioFirmaPar = (par: any[]) => {
        const items = par.map((espacioPregunta) => {
          const tituloLines = wrapText(
            String(espacioPregunta.fp_descripcion),
            imagenMaxWidth,
            9,
            helveticaBold,
          );
          const boxHeight =
            (espacioPregunta.espacio_lineas || 5) * espacioLineHeight;
          return { tituloLines, boxHeight };
        });

        const rowHeight =
          Math.max(...items.map((it) => it.tituloLines.length * 11 + 3)) +
          Math.max(...items.map((it) => it.boxHeight));

        if (yPos - rowHeight < 100) {
          currentPage = nuevaPagina();
          yPos = bodyTopY;
        }

        const rowTopY = yPos;
        const maxBoxHeight = Math.max(...items.map((it) => it.boxHeight));

        items.forEach((item, idx) => {
          const colX = marginLeft + idx * imagenColWidth;
          const colY = rowTopY - (maxBoxHeight - item.boxHeight);

          drawBox(colX, colY, imagenMaxWidth, item.boxHeight);

          let leyendaY = rowTopY - maxBoxHeight - 12;
          for (const line of item.tituloLines) {
            currentPage.drawText(line, {
              x: colX,
              y: leyendaY,
              size: 9,
              font: helveticaBold,
              color: rgb(0, 0.239, 0.6),
            });
            leyendaY -= 11;
          }
        });

        yPos -= rowHeight + 12;
      };

      // Organizar un tramo de preguntas NORMALES en 3 columnas - ALTURA DINÁMICA
      const columnWidth = contentWidth / 3;
      const maxColWidth = columnWidth - 12;

      // Layout de una pregunta calculado UNA sola vez y usado tanto para la
      // altura de la fila como para el dibujo — antes eran dos condiciones
      // distintas y, cuando no coincidían, la fila reservaba 10pt pero se
      // dibujaba en varias líneas, encimándose con la siguiente. Los anchos
      // salen de la fuente real, no de "letras × 4.5".
      const layoutNormal = (pregunta: any) => {
        const valor = pregunta.valor_resuelto;
        // 0 es una respuesta válida, no "Sin respuesta".
        const respuestaText =
          valor === null || valor === undefined || valor === ''
            ? 'Sin respuesta'
            : String(valor);
        const preguntaLines = wrapText(
          conDosPuntos(String(pregunta.fp_descripcion)),
          maxColWidth,
          8,
          helveticaBold,
        );
        const respuestaLines = wrapText(respuestaText, maxColWidth, 8);
        const anchoPregunta =
          preguntaLines.length === 1
            ? helveticaBold.widthOfTextAtSize(preguntaLines[0], 8)
            : 0;
        const enMismaLinea =
          preguntaLines.length === 1 &&
          respuestaLines.length === 1 &&
          respuestaText.length < 30 &&
          anchoPregunta + 2 + helvetica.widthOfTextAtSize(respuestaLines[0], 8) <=
            maxColWidth;
        const altura = enMismaLinea
          ? 10
          : preguntaLines.length * 9 + respuestaLines.length * 9 + 8;
        return {
          preguntaLines,
          respuestaLines,
          anchoPregunta,
          enMismaLinea,
          altura,
        };
      };

      const renderNormales = (preguntasArray: any[]) => {
        let preguntaIndex = 0;

        while (preguntaIndex < preguntasArray.length) {
          const preguntasFila = preguntasArray.slice(
            preguntaIndex,
            preguntaIndex + 3,
          );
          const layouts = preguntasFila.map(layoutNormal);
          const maxHeightInRow = Math.max(...layouts.map((l) => l.altura), 15);

          // Revisar el espacio ANTES de dibujar (antes solo se revisaba
          // después y una fila alta cerca del final se salía del margen).
          if (yPos - maxHeightInRow < 100) {
            currentPage = nuevaPagina();
            yPos = bodyTopY;
          }

          const rowStartY = yPos;

          preguntasFila.forEach((pregunta, col) => {
            const {
              preguntaLines,
              respuestaLines,
              anchoPregunta,
              enMismaLinea,
            } = layouts[col];
            const colX = marginLeft + columnWidth * col;
            let currentY = rowStartY;

            // Documento cargado (ARCHIVO/DOCUMENTOS_TABLA con archivo real en
            // Solicitud_archivo, ver formulario-renderizable.service.ts): se
            // resalta en verde en vez del gris estándar de cualquier otra
            // respuesta, para que salte a la vista qué ya se cargó.
            const colorRespuesta = pregunta.documento_cargado
              ? rgb(0.02, 0.45, 0.15)
              : rgb(0.2, 0.2, 0.2);

            if (enMismaLinea) {
              // Caben en la misma línea
              currentPage.drawText(preguntaLines[0], {
                x: colX,
                y: currentY,
                size: 8,
                font: helveticaBold,
                color: rgb(0, 0.239, 0.6),
              });

              currentPage.drawText(respuestaLines[0], {
                x: colX + anchoPregunta + 2,
                y: currentY,
                size: 8,
                font: helvetica,
                color: colorRespuesta,
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
                  color: colorRespuesta,
                });
                currentY -= 9;
              }
            }
          });

          preguntaIndex += preguntasFila.length;
          yPos -= maxHeightInRow + 12;
        }
      };

      // Dibujar los tramos en su orden real de aparición, despachando cada
      // uno a su renderizador según el tipo — las IMAGEN/ESPACIO_FIRMA se
      // siguen agrupando de a 2 por fila y las NORMALES en 3 columnas,
      // pero DENTRO de cada tramo (ya no globalmente por sección), para no
      // mezclar preguntas que en el formulario real no son consecutivas.
      for (const tramo of tramos) {
        if (tramo.tipo === 'NOTA') {
          for (const notaPregunta of tramo.items) renderNota(notaPregunta);
        } else if (tramo.tipo === 'TABLA') {
          for (const tablaPregunta of tramo.items) renderTabla(tablaPregunta);
        } else if (tramo.tipo === 'IMAGEN') {
          for (let i = 0; i < tramo.items.length; i += 2) {
            const par = [tramo.items[i], tramo.items[i + 1]].filter(Boolean);
            await renderImagenesPar(par);
          }
        } else if (tramo.tipo === 'ESPACIO_FIRMA') {
          for (let i = 0; i < tramo.items.length; i += 2) {
            const par = [tramo.items[i], tramo.items[i + 1]].filter(Boolean);
            renderEspacioFirmaPar(par);
          }
        } else {
          renderNormales(tramo.items);
        }
      }

      yPos -= 8;
    }

    // ===== FOOTER FINAL =====
    // Historial de revisiones ("CONTROL DE CAMBIOS"), al final de todo el
    // cuerpo — cursorTabla es un objeto temporal solo para reutilizar
    // dibujarTablaRevisionesPdf (que espera { page, y } mutable en vez de
    // las variables sueltas currentPage/yPos que usa el resto de esta
    // función); se sincroniza de vuelta apenas termina.
    const cursorTabla = { page: currentPage, y: yPos };
    dibujarTablaRevisionesPdf(
      cursorTabla,
      {
        marginLeft,
        contentWidth,
        fontRegular: helvetica,
        fontBold: helveticaBold,
        checkSpace: (c, needed) => {
          if (c.y - needed < 100) {
            c.page = nuevaPagina();
            c.y = bodyTopY;
          }
        },
      },
      revisionesDocumento,
    );
    currentPage = cursorTabla.page;
    yPos = cursorTabla.y;

    // Después de la tabla de revisiones (que puede agregar páginas) para
    // que quede en la última página. Hora de Colombia: en Render el proceso
    // corre en UTC y después de las 7 p.m. mostraba el día siguiente.
    currentPage.drawText(
      `Documento generado: ${new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}`,
      {
        x: marginLeft,
        y: 30,
        size: 8,
        font: helvetica,
        color: rgb(0.6, 0.6, 0.6),
      },
    );

    // El encabezado oficial se dibuja al final, una vez que se sabe el
    // total real de páginas que ocupó el cuerpo — "PAGINA No. X de N"
    // refleja la paginación real generada, no un valor fijo configurado de
    // antemano (mismo criterio que generarFormatoOficialPdf en el frontend).
    const totalPaginas = paginas.length;
    // tdo_nombre suele traer el código de formato y "REV N" incluidos en el
    // texto (ej. "F-P3-06 ... REV 10") — ambos ya se muestran en sus propias
    // celdas del encabezado (FORMATO / REVISION), así que se recortan acá
    // para no duplicarlos en la barra de título.
    let tituloEncabezado =
      tipoDocumentoFormato?.tdo_nombre || 'SOLICITUD DE VINCULACIÓN COMERCIAL';
    const formatoCodigoValue = tipoDocumentoFormato?.tdo_formato_codigo || '';
    if (formatoCodigoValue && tituloEncabezado.startsWith(formatoCodigoValue)) {
      tituloEncabezado = tituloEncabezado
        .slice(formatoCodigoValue.length)
        .trim();
    }
    tituloEncabezado = tituloEncabezado
      .replace(/[\s_-]*REV(?:ISI[OÓ]N)?\.?\s*\d+\s*$/i, '')
      .trim();
    paginas.forEach((pagina, idx) => {
      dibujarEncabezadoOficialPdf(
        pagina,
        {
          marginLeft,
          contentWidth,
          headerTopY,
          logoImage,
          fontRegular: helvetica,
          fontBold: helveticaBold,
          razonSocial: 'CARTONERA NACIONAL S.A.',
          tituloDocumento: tituloEncabezado,
          formatoCodigo: tipoDocumentoFormato?.tdo_formato_codigo || '-',
          formatoCodigoSecundario:
            tipoDocumentoFormato?.tdo_formato_codigo_secundario,
          revision: tipoDocumentoFormato?.tdo_revision,
        },
        idx + 1,
        totalPaginas,
      );
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  async getDiasRespuesta(): Promise<ParamDiasRespuestaResponseDto[]> {
    try {
      return await this.dataSource.query(
        `SELECT pdr_id AS id, pdr_area AS area, pdr_dias AS dias FROM param_dias_respuesta_solicitudes WHERE pdr_estado = 1 ORDER BY pdr_id`,
      );
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
        `SELECT wet_id, wet_nombre FROM workflow_etapas WHERE wet_activo = 1 ORDER BY wet_orden`,
      );
      return etapas;
    } catch (error) {
      // Se relanza: devolver [] dejaba el combo vacío en el frontend sin
      // ninguna pista de que la BD había fallado.
      console.error('[getEtapas] Error:', error);
      throw error;
    }
  }

  async getResultados(): Promise<WorkflowResultadoResponseDto[]> {
    try {
      const resultados = await this.dataSource.query(
        `SELECT wee_id, wee_nombre FROM workflow_estado_etapa WHERE wee_activo = 1 ORDER BY wee_id`,
      );
      return resultados;
    } catch (error) {
      console.error('[getResultados] Error:', error);
      throw error;
    }
  }

  private async obtenerSiguienteNumeroSolicitud(
    queryRunner?: any,
  ): Promise<string> {
    const runner = queryRunner || this.dataSource.createQueryRunner();
    const ownRunner = !queryRunner;

    try {
      const result = await runner.query(
        `DECLARE @numero_solicitud INT;
         EXEC sp_ObtenerSiguienteNumeroSolicitud @numero_solicitud = @numero_solicitud OUTPUT;
         SELECT @numero_solicitud as numero_solicitud;`,
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
}
