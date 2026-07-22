// src/solicitudes/solicitudes.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import axios from 'axios';
import { addBusinessDays } from '../common/utils/business-days.util';
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
  leerLogoBytes,
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
        CASE WHEN COL_LENGTH('Solicitudes_estados_hist','seh_sol_id') IS NOT NULL THEN 'seh_sol_id' ELSE 'sa_sol_id' END AS solicitud_col,
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

      // 1.5. Validar que no exista ya una solicitud en estado BORRADOR para este cliente
      const solicitudBorrador = await queryRunner.query(
        `SELECT sol_id, sol_numero_solicitud FROM solicitudes
         WHERE sol_cliente_id = @0 AND sol_estado_id = 1`,
        [clienteId],
      );

      if (solicitudBorrador && solicitudBorrador.length > 0) {
        throw new Error(
          `El cliente ya tiene una solicitud en borrador (No. ${solicitudBorrador[0].sol_numero_solicitud}). Complétala o elimínala antes de crear una nueva.`,
        );
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

      let diasNoHabilesSemana: number[] | undefined;
      try {
        const diasNoHabilesResult = await queryRunner.query(
          `
          SELECT dsh_dia_semana AS dia
          FROM param_dias_no_habiles_semana
          WHERE (dsh_co_id = @0 OR dsh_co_id IS NULL) AND dsh_activo = 1
        `,
          [coId],
        );
        diasNoHabilesSemana = (diasNoHabilesResult || [])
          .map((row: any) => Number(row?.dia))
          .filter((value: number) => !Number.isNaN(value));
      } catch (error) {
        console.warn(
          '⚠️ Tabla param_dias_no_habiles_semana no encontrada, usando sábado/domingo por defecto',
        );
        diasNoHabilesSemana = undefined;
      }

      // Encadenadas: cada etapa asume que la anterior se resolvió justo a
      // tiempo, no que todas arrancan el mismo día de creación (si no, dos
      // etapas con el mismo plazo configurado caen en la misma fecha).
      const fechaEstimadaEjecutivo = addBusinessDays(
        now,
        diasRespuestaEjecutivo,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaAuxiliar = addBusinessDays(
        fechaEstimadaEjecutivo,
        diasRespuestaAuxiliar,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaOficial = addBusinessDays(
        fechaEstimadaAuxiliar,
        diasRespuestaOficial,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaCC1 = addBusinessDays(
        fechaEstimadaOficial,
        diasRespuestaCC1,
        festivos,
        diasNoHabilesSemana,
      );

      const fechaEstimadaCC2 = addBusinessDays(
        fechaEstimadaCC1,
        diasRespuestaCC2,
        festivos,
        diasNoHabilesSemana,
      );

      const formularioActivoResult = await queryRunner.query(`
        SELECT TOP 1 ISNULL(
          f.frm_version_activa,
          (SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frm_id = f.frm_id)
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
          sol_etapa_actual_id, sol_resultado_etapa_id, sol_observacion_cliente
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, @7, @8, @9,
          @10, @11, @12, @13, @14, @15, @16, @17, @18, @19,
          @20, @21, @22, @23, @24, @25, @26, @27
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

      // 5.0 "Documentos diferidos": preguntas ocultas del formulario en vivo
      // cuyo tipo de documento tiene plantilla descargable (se generan
      // DESPUÉS de guardar la solicitud, con el número de solicitud). Como
      // recién se está creando, ninguno puede estar subido todavía — si el
      // formulario de esta versión tiene alguno configurado, la solicitud
      // se queda en CLI+PEND_DOCS en vez de pasar directo a EJN.
      let documentosDiferidosFaltantes: {
        tdo_id: number;
        tdo_nombre: string;
      }[] = [];
      if (estadoId === 2) {
        documentosDiferidosFaltantes = await queryRunner.query(
          `
          SELECT DISTINCT td.tdo_id, td.tdo_nombre
          FROM Formulario_pregunta fp
          JOIN Tipos_documentos td ON td.tdo_id = fp.fp_tipo_documento_id
          LEFT JOIN Formulario_secciones fs ON fs.fs_id = fp.seccion_id
          WHERE fp.fp_estado = 1
            AND td.tdo_tiene_plantilla = 1
            AND (fp.fp_oculto_en_formulario = 1 OR fs.fs_oculta_en_formulario = 1)
            AND ISNULL(fp.fp_version, 1) = @0
          `,
          [formularioVersion || 1],
        );
      }
      const hayDocumentosDiferidos = documentosDiferidosFaltantes.length > 0;

      let resultadoFinalId = resultadoPdId;
      if (hayDocumentosDiferidos) {
        const resultadoPendDocs = await queryRunner.query(
          `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PEND_DOCS'`,
        );
        resultadoFinalId = resultadoPendDocs?.[0]?.wee_id ?? resultadoPdId;
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
            ? `Aún faltan generar y subir: ${documentosDiferidosFaltantes
                .map((d) => d.tdo_nombre)
                .join(', ')}.`
            : 'Formulario y documentos cargados correctamente. Puedes editar hasta que Cartonera revise tu solicitud.';

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
        resultadoFinalId, // @26 sol_resultado_etapa_id (PENDIENTE, o PEND_DOCS si faltan documentos diferidos)
        observacionClienteInicial, // @27 sol_observacion_cliente
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
        const etapaTransicion = estadoId === 2 ? etapaActualId : null;
        const mensajeTransicion = hayDocumentosDiferidos
          ? `Solicitud registrada - faltan documentos por generar y subir: ${documentosDiferidosFaltantes
              .map((d) => d.tdo_nombre)
              .join(', ')}`
          : 'Solicitud enviada a Ejecutivo de Negocios';
        if (etapaTransicion) {
          await this.historialWorkflowService.registrarTransicionConSLA(
            queryRunner,
            {
              solicitudId,
              etapaId: etapaTransicion,
              resultadoId: resultadoFinalId,
              usuarioId: 1, // usuario 1
              comentario: mensajeTransicion,
            },
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

      if (!hayDocumentosDiferidos) {
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

    // Encabezado "formato oficial" — este PDF ES el documento F-P3-06
    // (tdo_tipo_plantilla='PDF_SOLICITUD'), así que su código/revisión salen
    // de esa fila de Tipos_documentos en vez de estar hardcodeados.
    const tipoDocumentoFormatoRows = await this.dataSource.query(`
      SELECT TOP 1 tdo_id, tdo_nombre, tdo_formato_codigo, tdo_formato_codigo_secundario, tdo_revision
      FROM Tipos_documentos
      WHERE tdo_tipo_plantilla = 'PDF_SOLICITUD' AND tdo_estado = 1
      ORDER BY tdo_id
    `);
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
      fecha: new Date(r.tdr_fecha).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    }));

    const pdfDoc = await PDFDocument.create();
    const logoBytes = leerLogoBytes();
    const logoImage = await pdfDoc.embedJpg(logoBytes);
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
      const words = String(text).split(/\s+/).filter(Boolean);
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

        yPos -= notaBoxHeight + 8;

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
        for (const line of tituloLines) {
          if (yPos < 100) {
            currentPage = nuevaPagina();
            yPos = bodyTopY;
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
            wrapText(
              String(fila[columna] ?? ''),
              colWidth - cellPaddingX * 2,
              fontSize,
            ),
          ),
        );

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

        yPos -= 10;
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
              const respuestaImagen = await axios.get(
                imagenPregunta.imagen_ruta,
                { responseType: 'arraybuffer' },
              );
              const bytes = Buffer.from(respuestaImagen.data);
              const esPng = /png/i.test(imagenPregunta.imagen_tipo_mime || '');
              const embeddedImage = esPng
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
      const renderNormales = (preguntasArray: any[]) => {
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
            const preguntaLines = wrapText(
              conDosPuntos(preguntaText),
              maxColWidth,
              8,
              helveticaBold,
            );
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
            // Documento cargado (ARCHIVO/DOCUMENTOS_TABLA con archivo real en
            // Solicitud_archivo, ver formulario-renderizable.service.ts): se
            // resalta en verde en vez del gris estándar de cualquier otra
            // respuesta, para que salte a la vista qué ya se cargó.
            const colorRespuesta = pregunta.documento_cargado
              ? rgb(0.02, 0.45, 0.15)
              : rgb(0.2, 0.2, 0.2);
            const preguntaLines = wrapText(
              conDosPuntos(preguntaText),
              maxColWidth,
              8,
              helveticaBold,
            );
            const respuestaLines = wrapText(respuestaText, maxColWidth, 8);

            // Si pregunta cabe en 1 línea y respuesta es corta, intentar poner juntas
            if (
              preguntaLines.length === 1 &&
              respuestaText.length < 30 &&
              (preguntaLines[0].length + respuestaText.length) * 4.5 <
                maxColWidth
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

            preguntaIndex++;
          }

          yPos -= maxHeightInRow + 12;

          // Nueva página si es necesario
          if (yPos < 100) {
            currentPage = nuevaPagina();
            yPos = bodyTopY;
          }
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
        `SELECT wet_id, wet_nombre FROM workflow_etapas WHERE wet_activo = 1 ORDER BY wet_orden`,
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
        `SELECT wee_id, wee_nombre FROM workflow_estado_etapa WHERE wee_activo = 1 ORDER BY wee_id`,
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
}
