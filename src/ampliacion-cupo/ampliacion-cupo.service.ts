import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateAmpliacionCupoDto, UpdateAmpliacionCupoDto } from './dto';
import { ClienteArchivoService } from '../cliente-archivo/cliente-archivo.service';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../common/storage/storage.interface';
import {
  CarpetaAlmacenamientoService,
  TIPO_ARCHIVO_URLS,
} from '../common/storage/carpeta-almacenamiento.service';
import { HistorialWorkflowService } from '../workflow/historial/historial-workflow.service';
import { obtenerVersionFormularioActivo } from '../common/utils/formulario-activo.util';

const CAMPOS_SOLICITUD_AMPLIACION = `
  sol_id, sol_cli_id, sol_cupo_solicitado, sol_cupo_actual_referencia,
  sol_justificacion_ampliacion, sol_consumo_mensual_proyectado, sol_toneladas_proyectadas,
  sol_ses_id, sol_wet_id, sol_wee_id,
  sol_numero, sol_created_at
`;

// Estados "en trámite" por ses_codigo (llave estable de solicitud_estados),
// listos para un IN (...) de SQL.
const ESTADOS_EN_TRAMITE = `'BORRADOR', 'PENDIENTE', 'REVISION'`;

// Preguntas que llena la propia ampliación (reservadas en
// formulario_preguntas_reservadas). Son obligatorias y NO se copian de la
// última solicitud aprobada: si se copiaran, quedarían duplicadas con el
// valor viejo junto al nuevo.
const CODIGOS_PREGUNTAS_AMPLIACION = [
  'TIPO_SOLICITUD',
  'SOLICITA_CREDITO',
  'CUPO_SOLICITADO',
  'CONCEPTO_CONSUMO_PROYECTADO',
  'CONCEPTO_TONELADAS_PROYECTADO',
];

@Injectable()
export class AmpliacionCupoService {
  private readonly logger = new Logger('AmpliacionCupoService');

  constructor(
    private readonly dataSource: DataSource,
    private readonly clienteArchivoService: ClienteArchivoService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
    private readonly carpetaAlmacenamiento: CarpetaAlmacenamientoService,
    private readonly historialWorkflowService: HistorialWorkflowService,
  ) {}

  private async obtenerSiguienteNumeroSolicitud(
    queryRunner: any,
  ): Promise<string> {
    const result = await queryRunner.query(
      `DECLARE @numero_solicitud INT;
       EXEC sp_ObtenerSiguienteNumeroSolicitud @numero_solicitud = @numero_solicitud OUTPUT;
       SELECT @numero_solicitud as numero_solicitud;`,
    );

    if (result && result.length > 0) {
      return String(result[0].numero_solicitud);
    }

    throw new Error('No se pudo generar el número de solicitud');
  }

  async create(dto: CreateAmpliacionCupoDto, usuarioId: number) {
    this.logger.log(`Creating ampliacion-cupo for cliente ${dto.clienteId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Copias hechas en el almacenamiento por clonarDocumentosClienteArchivo: si la
    // transacción se revierte, se borran para no dejar archivos huérfanos.
    const copiasAlmacenamiento: { providerId: string; resourceType: string }[] =
      [];

    try {
      const [enTramite] = await queryRunner.query(
        `SELECT TOP 1 s.sol_numero
         FROM solicitudes s
         JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
         WHERE s.sol_cli_id = @0 AND se.ses_codigo IN (${ESTADOS_EN_TRAMITE})
         ORDER BY s.sol_id DESC`,
        [dto.clienteId],
      );

      if (enTramite) {
        throw new ConflictException(
          `El cliente ya tiene una solicitud en trámite (${enTramite.sol_numero}). ` +
            `Debe resolverse antes de crear una nueva ampliación de cupo.`,
        );
      }

      // 1. Verificar documentos vencidos de la última solicitud
      const tieneDocumentosVencidos = await this.verificarDocumentosVencidos(
        dto.clienteId,
      );

      // Con documentos vencidos va al cliente (PENDIENTE); si no, directo a
      // Oficial de Cumplimiento (REVISION).
      const estados = await queryRunner.query(
        `SELECT ses_id, ses_codigo FROM solicitud_estados WHERE ses_codigo IN ('PENDIENTE', 'REVISION')`,
      );
      const estadoPorCodigo = new Map<string, number>(
        estados.map((e: any) => [e.ses_codigo, e.ses_id]),
      );
      const codigoEstado = tieneDocumentosVencidos ? 'PENDIENTE' : 'REVISION';
      const estadoId = estadoPorCodigo.get(codigoEstado);
      if (estadoId === undefined) {
        throw new Error(
          `No existe el estado '${codigoEstado}' en solicitud_estados.`,
        );
      }
      this.logger.log(
        `Cliente ${dto.clienteId}: documentos ${tieneDocumentosVencidos ? 'vencidos → Cliente' : 'vigentes → Oficial de Cumplimiento'} (${codigoEstado})`,
      );

      // 2. Obtener cliente
      const clienteResult = await queryRunner.query(
        `SELECT ejng_id FROM clientes WHERE cli_id = @0`,
        [dto.clienteId],
      );

      if (!clienteResult || clienteResult.length === 0) {
        throw new Error(`Cliente ${dto.clienteId} no encontrado`);
      }

      const ejecutivoId = clienteResult[0].ejng_id;

      const numeroSolicitud =
        await this.obtenerSiguienteNumeroSolicitud(queryRunner);

      const formularioVersion =
        await obtenerVersionFormularioActivo(queryRunner);

      // 5. Obtener etapas del workflow
      const etapaClienteResult = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'CLI'`,
      );
      const etapaClienteId = etapaClienteResult?.[0]?.wet_id;

      const etapaOFCResult = await queryRunner.query(
        `SELECT wet_id FROM workflow_etapas WHERE wet_codigo = 'OFC'`,
      );
      const etapaOFCId = etapaOFCResult?.[0]?.wet_id;

      const resultadoResult = await queryRunner.query(
        `SELECT wee_id FROM workflow_estado_etapa WHERE wee_codigo = 'PENDIENTE'`,
      );
      const resultadoId = resultadoResult?.[0]?.wee_id;

      if (!etapaClienteId || !etapaOFCId || !resultadoId) {
        throw new Error(
          'No se encontraron las etapas del workflow (CLI, OFC) o resultado PENDIENTE',
        );
      }

      const etapaId = tieneDocumentosVencidos ? etapaClienteId : etapaOFCId;

      const now = new Date();
      const insertSolicitudSQL = `
        INSERT INTO solicitudes (
          sol_cli_id, sol_ses_id,
          sol_fecha_creacion, sol_created_at, sol_updated_at,
          sol_version, sol_formulario_version, sol_numero,
          sol_ejng_id, sol_wet_id, sol_wee_id,
          sol_cupo_solicitado, sol_justificacion_ampliacion, sol_cupo_actual_referencia,
          sol_consumo_mensual_proyectado, sol_toneladas_proyectadas
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @15
        );
        SELECT SCOPE_IDENTITY() AS sol_id;
      `;

      const solicitudParams = [
        dto.clienteId, // @0
        estadoId, // @1 PENDIENTE o REVISION
        now, // @2 fecha_creacion
        now, // @3 created_at
        now, // @4 updated_at
        1, // @5 version
        formularioVersion, // @6 formulario_version
        numeroSolicitud, // @7 numero_solicitud
        ejecutivoId, // @8 ejecutivo_id
        etapaId, // @9 etapa_actual_id
        resultadoId, // @10 resultado_etapa_id
        dto.nuevoCupo, // @11 cupo_solicitado
        dto.justificacion, // @12 justificacion_ampliacion
        dto.cupoActualReferencia ?? null, // @13 cupo_actual_referencia
        dto.consumoMensualProyectado, // @14 consumo_mensual_proyectado
        dto.toneladasProyectadas, // @15 toneladas_proyectadas
      ];

      const solicitudResult = await queryRunner.query(
        insertSolicitudSQL,
        solicitudParams,
      );
      const solicitudId = solicitudResult[0]?.sol_id;

      if (!solicitudId) {
        throw new Error('No se obtuvo ID de la solicitud');
      }

      this.logger.log(
        `✅ Solicitud creada con ID ${solicitudId} para ampliación de cupo`,
      );

      await this.guardarRespuestasFormularioAmpliacion(
        queryRunner,
        solicitudId,
        formularioVersion,
        dto.nuevoCupo,
        dto.consumoMensualProyectado,
        dto.toneladasProyectadas,
        usuarioId,
      );

      await this.clonarRespuestasUltimaAprobada(
        queryRunner,
        dto.clienteId,
        solicitudId,
        formularioVersion,
        usuarioId,
      );

      if (!tieneDocumentosVencidos) {
        await this.clonarDocumentosClienteArchivo(
          queryRunner,
          dto.clienteId,
          solicitudId,
          formularioVersion,
          numeroSolicitud,
          copiasAlmacenamiento,
        );
      }
      await this.historialWorkflowService.registrarTransicionConSLA(
        queryRunner,
        {
          solicitudId,
          etapaId,
          resultadoId,
          usuarioId,
        },
      );

      const [creada] = await queryRunner.query(
        `SELECT ${CAMPOS_SOLICITUD_AMPLIACION} FROM solicitudes WHERE sol_id = @0`,
        [solicitudId],
      );

      await queryRunner.commitTransaction();
      return creada;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Error creating ampliacion-cupo:', error);
      // La fila de Solicitud_archivo ya se revirtió; se borran también las
      // copias en el almacenamiento. Si una falla solo se registra: el error que
      // importa es el original, que se relanza abajo.
      for (const copia of copiasAlmacenamiento) {
        try {
          await this.storageService.destroy(
            copia.providerId,
            copia.resourceType,
          );
        } catch (errorLimpieza) {
          this.logger.error(
            `No se pudo borrar la copia huérfana ${copia.providerId} en el almacenamiento:`,
            errorLimpieza,
          );
        }
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async guardarRespuestasFormularioAmpliacion(
    queryRunner: any,
    solicitudId: number,
    formularioVersion: number,
    nuevoCupo: number,
    consumoMensualProyectado: number,
    toneladasProyectadas: number,
    usuarioId: number,
  ): Promise<void> {
    const codigosRequeridos = CODIGOS_PREGUNTAS_AMPLIACION;
    const preguntas: { fp_id: number; fp_codigo: string }[] =
      await queryRunner.query(
        `SELECT fp_id, fp_codigo FROM Formulario_pregunta
         WHERE fp_codigo IN (${codigosRequeridos.map((_, i) => `@${i + 1}`).join(', ')})
           AND fp_estado = 1 AND ISNULL(fp_version, 1) = @0`,
        [formularioVersion, ...codigosRequeridos],
      );
    const fpIdPorCodigo = new Map(preguntas.map((p) => [p.fp_codigo, p.fp_id]));
    const faltantes = codigosRequeridos.filter((c) => !fpIdPorCodigo.has(c));
    if (faltantes.length > 0) {
      throw new Error(
        `Faltan preguntas activas en el formulario (versión ${formularioVersion}) para la ampliación de cupo: ${faltantes.join(', ')}.`,
      );
    }
    const fpId = (codigo: string) => fpIdPorCodigo.get(codigo)!;

    const upsert = async (
      fp_id: number,
      valores: {
        texto?: string | null;
        numero?: number | null;
        opcionId?: number | null;
      },
    ) => {
      const [existente] = await queryRunner.query(
        `SELECT fr_id FROM Formulario_respuesta
         WHERE fr_sol_id = @0 AND fr_fp_id = @1`,
        [solicitudId, fp_id],
      );
      const params = [
        valores.texto ?? null,
        valores.numero ?? null,
        valores.opcionId ?? null,
        usuarioId,
      ];
      if (existente) {
        await queryRunner.query(
          `UPDATE Formulario_respuesta SET
             fr_valor_texto = @0, fr_valor_numero = @1, fr_valor_opcion_id = @2,
             fr_actualizado_por = @3, fr_updated_at = GETDATE(), fr_completado = 1
           WHERE fr_id = @4`,
          [...params, existente.fr_id],
        );
      } else {
        await queryRunner.query(
          `INSERT INTO Formulario_respuesta
             (fr_sol_id, fr_fp_id, fr_valor_texto, fr_valor_numero,
              fr_valor_opcion_id, fr_actualizado_por, fr_completado, fr_created_at)
           VALUES (@4, @5, @0, @1, @2, @3, 1, GETDATE())`,
          [...params, solicitudId, fp_id],
        );
      }
    };

    // Por fpo_codigo (identidad estable), no por el texto de la opción, que
    // se puede editar en parametrización.
    const buscarOpcion = async (codigoPregunta: string, fpoCodigo: string) => {
      const [opcion] = await queryRunner.query(
        `SELECT fpo_id FROM Formulario_pregunta_opcion
         WHERE fpo_fp_id = @0 AND fpo_codigo = @1 AND fpo_estado = 1`,
        [fpId(codigoPregunta), fpoCodigo],
      );
      if (!opcion) {
        throw new Error(
          `No existe la opción activa '${fpoCodigo}' en la pregunta ${codigoPregunta}.`,
        );
      }
      return opcion.fpo_id as number;
    };

    await upsert(fpId('TIPO_SOLICITUD'), {
      opcionId: await buscarOpcion('TIPO_SOLICITUD', 'AMPLIACION_CUPO'),
    });
    await upsert(fpId('SOLICITA_CREDITO'), {
      opcionId: await buscarOpcion('SOLICITA_CREDITO', 'SI'),
    });
    await upsert(fpId('CUPO_SOLICITADO'), { numero: nuevoCupo });
    await upsert(fpId('CONCEPTO_CONSUMO_PROYECTADO'), {
      numero: consumoMensualProyectado,
    });
    await upsert(fpId('CONCEPTO_TONELADAS_PROYECTADO'), {
      numero: toneladasProyectadas,
    });
  }

  private async clonarRespuestasUltimaAprobada(
    queryRunner: any,
    clienteId: number,
    solicitudIdNueva: number,
    formularioVersion: number,
    usuarioId: number,
  ): Promise<void> {
    const [ultimaAprobada] = await queryRunner.query(
      `SELECT TOP 1 s.sol_id
       FROM solicitudes s
       JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
       WHERE s.sol_cli_id = @0 AND se.ses_codigo = 'APROBADA'
       ORDER BY s.sol_fecha_creacion DESC`,
      [clienteId],
    );
    // Un cliente sin solicitud aprobada no tiene respuestas que heredar (no
    // es configuración faltante: es un cliente que aún no fue aprobado).
    if (!ultimaAprobada) return;

    const preguntasNuevas: {
      fp_id: number;
      fp_codigo: string;
      fp_tipo: string;
    }[] = await queryRunner.query(
      `SELECT fp_id, fp_codigo, fp_tipo FROM Formulario_pregunta
       WHERE fp_estado = 1 AND ISNULL(fp_version, 1) = @0
         AND fp_codigo IS NOT NULL
         AND fp_precarga_fuente IN ('ultima_solicitud', 'cliente_primero')
         AND fp_codigo NOT IN (${CODIGOS_PREGUNTAS_AMPLIACION.map((c) => `'${c}'`).join(', ')})
         -- Igual que usePrefillConfiguracion en el frontend: nunca copiar
         -- documentos/firmas/notas aunque fp_precarga_fuente esté mal
         -- configurado en alguna pregunta puntual (visto en vivo: RUT,
         -- DOCUMENTOS_TABLA, tenía la bandera activa y no debería).
         AND fp_tipo IN ('TEXTO', 'NUMERO', 'FECHA', 'SELECT', 'SELECT_TABLA', 'TABLA', 'MULTISELECT')`,
      [formularioVersion],
    );
    const nuevaPorCodigo = new Map(
      preguntasNuevas.map((p) => [p.fp_codigo, p]),
    );

    const respuestas: {
      fr_fp_id: number;
      fr_valor_texto: string | null;
      fr_valor_numero: number | null;
      fr_valor_fecha: string | null;
      fr_valor_opcion_id: number | null;
      fr_es_multiselect: boolean | null;
      fp_codigo: string;
      fpo_codigo: string | null;
    }[] = await queryRunner.query(
      `SELECT fr.fr_fp_id, fr.fr_valor_texto, fr.fr_valor_numero, fr.fr_valor_fecha,
              fr.fr_valor_opcion_id, fr.fr_es_multiselect, fp.fp_codigo, fpo.fpo_codigo
       FROM Formulario_respuesta fr
       JOIN Formulario_pregunta fp ON fp.fp_id = fr.fr_fp_id
       LEFT JOIN Formulario_pregunta_opcion fpo ON fpo.fpo_id = fr.fr_valor_opcion_id
       WHERE fr.fr_sol_id = @0`,
      [ultimaAprobada.sol_id],
    );

    const porFpIdOrigen = new Map<number, typeof respuestas>();
    for (const r of respuestas) {
      const lista = porFpIdOrigen.get(r.fr_fp_id) ?? [];
      lista.push(r);
      porFpIdOrigen.set(r.fr_fp_id, lista);
    }

    // Opciones activas de las preguntas destino, en una sola consulta, para
    // traducir cada opción de origen por su fpo_codigo (antes era una
    // consulta por fila).
    const opciones: { fpo_id: number; fpo_fp_id: number; fpo_codigo: string }[] =
      preguntasNuevas.length === 0
        ? []
        : await queryRunner.query(
            `SELECT fpo_id, fpo_fp_id, fpo_codigo FROM Formulario_pregunta_opcion
             WHERE fpo_estado = 1 AND fpo_codigo IS NOT NULL
               AND fpo_fp_id IN (SELECT value FROM OPENJSON(@0))`,
            [JSON.stringify(preguntasNuevas.map((p) => p.fp_id))],
          );
    const opcionPorClave = new Map<string, number>();
    for (const o of opciones) {
      const clave = `${o.fpo_fp_id}|${o.fpo_codigo}`;
      if (!opcionPorClave.has(clave)) opcionPorClave.set(clave, o.fpo_id);
    }

    const filasNuevas: {
      fp_id: number;
      texto: string | null;
      numero: number | null;
      fecha: string | null;
      opcion_id: number | null;
      multi: boolean | null;
    }[] = [];

    for (const filas of porFpIdOrigen.values()) {
      const nueva = nuevaPorCodigo.get(filas[0].fp_codigo);
      if (!nueva) continue; // la pregunta ya no existe en esta versión

      // Guardar una respuesta siempre reemplaza la anterior (DELETE+INSERT
      // o UPDATE), así que todas las filas de la pregunta son vigentes.
      // Solo las de selección múltiple pueden tener varias; cualquier otro
      // tipo con más de una es un dato inconsistente → revienta.
      if (
        nueva.fp_tipo !== 'MULTISELECT' &&
        nueva.fp_tipo !== 'SELECT_TABLA' &&
        filas.length !== 1
      ) {
        throw new Error(
          `La pregunta ${filas[0].fp_codigo} (${nueva.fp_tipo}) tiene ${filas.length} respuestas en la solicitud ${ultimaAprobada.sol_id}; se esperaba una.`,
        );
      }

      for (const fila of filas) {
        let opcionId: number | null = null;
        if (fila.fr_valor_opcion_id) {
          if (!fila.fpo_codigo) continue; // opción sin identidad estable, no se traduce con seguridad
          const traducida = opcionPorClave.get(
            `${nueva.fp_id}|${fila.fpo_codigo}`,
          );
          if (!traducida) continue; // la opción ya no existe en esta versión
          opcionId = traducida;
        }
        filasNuevas.push({
          fp_id: nueva.fp_id,
          texto: fila.fr_valor_texto,
          numero: fila.fr_valor_numero,
          fecha: fila.fr_valor_fecha,
          opcion_id: opcionId,
          multi: fila.fr_es_multiselect,
        });
      }
    }

    if (filasNuevas.length === 0) return;

    await queryRunner.query(
      `INSERT INTO Formulario_respuesta
         (fr_sol_id, fr_fp_id, fr_valor_texto, fr_valor_numero, fr_valor_fecha,
          fr_valor_opcion_id, fr_es_multiselect, fr_actualizado_por, fr_completado, fr_created_at)
       SELECT @0, fp_id, texto, numero, fecha, opcion_id, multi, @2, 1, GETDATE()
       FROM OPENJSON(@1) WITH (
         fp_id INT, texto NVARCHAR(MAX), numero DECIMAL(18, 0), fecha DATE,
         opcion_id BIGINT, multi BIT
       )`,
      [solicitudIdNueva, JSON.stringify(filasNuevas), usuarioId],
    );
  }

  private async clonarDocumentosClienteArchivo(
    queryRunner: any,
    clienteId: number,
    solicitudIdNueva: number,
    formularioVersion: number,
    numeroSolicitud: string,
    copiasAlmacenamiento: { providerId: string; resourceType: string }[],
  ): Promise<void> {
    const documentosCliente: {
      ca_tdo_id: number;
      ca_nombre_original: string;
      ca_ruta_almacenamiento: string;
      ca_tipo_mime: string | null;
      ca_resource_type: string | null;
      ca_fecha_emision: string | null;
      ca_fecha_vencimiento: string | null;
    }[] = await queryRunner.query(
      `SELECT ca_tdo_id, ca_nombre_original, ca_ruta_almacenamiento, ca_tipo_mime,
              ca_resource_type, ca_fecha_emision, ca_fecha_vencimiento
       FROM Cliente_archivo WHERE ca_cli_id = @0`,
      [clienteId],
    );
    if (!documentosCliente.length) return;

    const preguntasDocumento: {
      fp_id: number;
      fp_tdo_id: number;
    }[] = await queryRunner.query(
      `SELECT fp_id, fp_tdo_id FROM Formulario_pregunta
         WHERE fp_estado = 1 AND ISNULL(fp_version, 1) = @0
           AND fp_tdo_id IS NOT NULL`,
      [formularioVersion],
    );
    const fpIdPorTdoId = new Map(
      preguntasDocumento.map((p) => [p.fp_tdo_id, p.fp_id]),
    );

    const carpetaBase = await this.carpetaAlmacenamiento.obtenerBase(
      TIPO_ARCHIVO_URLS.SOLICITUDES,
    );
    const carpetaDestino = `${carpetaBase}formularios/${numeroSolicitud}`;

    // Documento del archivo maestro cuyo tipo no se pide en el formulario
    // actual (ej. subido por otra vía): no hay dónde ponerlo, se omite.
    const aClonar = documentosCliente
      .map((doc) => ({ doc, fpId: fpIdPorTdoId.get(doc.ca_tdo_id) }))
      .filter((x): x is { doc: (typeof documentosCliente)[number]; fpId: number } =>
        Boolean(x.fpId),
      );

    // Copias en paralelo (antes una tras otra). Sin try/catch: si el
    // almacenamiento falla, falla la ampliación completa (antes se omitía
    // el documento en silencio). allSettled y no all: hay que registrar en
    // copiasAlmacenamiento TODAS las copias que sí se crearon, para que el
    // caller las borre si la ampliación falla; con all, las que terminan
    // después del primer error quedarían huérfanas.
    const resultados = await Promise.allSettled(
      aClonar.map(({ doc }) =>
        this.storageService.duplicate(doc.ca_ruta_almacenamiento, {
          folder: carpetaDestino,
          filename: doc.ca_nombre_original,
          resourceType: doc.ca_resource_type || 'raw',
        }),
      ),
    );
    for (const r of resultados) {
      if (r.status === 'fulfilled') {
        copiasAlmacenamiento.push({
          providerId: r.value.providerId,
          resourceType: r.value.resourceType,
        });
      }
    }
    const fallo = resultados.find((r) => r.status === 'rejected');
    if (fallo) throw (fallo as PromiseRejectedResult).reason;

    const filas = aClonar.map(({ doc, fpId }, i) => {
      const duplicado = (
        resultados[i] as PromiseFulfilledResult<{
          url: string;
          providerId: string;
          resourceType: string;
        }>
      ).value;
      return {
        fp_id: fpId,
        nombre: doc.ca_nombre_original,
        mime: doc.ca_tipo_mime,
        ruta: duplicado.url,
        id_alm: duplicado.providerId,
        resource_type: duplicado.resourceType,
        emision: doc.ca_fecha_emision,
        vencimiento: doc.ca_fecha_vencimiento,
      };
    });

    if (filas.length > 0) {
      await queryRunner.query(
        `INSERT INTO Solicitud_archivo
           (sa_sol_id, sa_fp_id, sa_nombre_original, sa_nombre_guardado, sa_tipo_mime,
            sa_ruta_almacenamiento, sa_id_almacenamiento, sa_resource_type,
            sa_estado, sa_created_at, sa_fecha_emision, sa_fecha_vencimiento)
         SELECT @0, fp_id, nombre, nombre, mime, ruta, id_alm, resource_type,
                'activo', GETDATE(), emision, vencimiento
         FROM OPENJSON(@1) WITH (
           fp_id INT, nombre NVARCHAR(500), mime NVARCHAR(200),
           ruta NVARCHAR(MAX), id_alm NVARCHAR(500), resource_type NVARCHAR(50),
           emision DATE, vencimiento DATE
         )`,
        [solicitudIdNueva, JSON.stringify(filas)],
      );
    }

    this.logger.log(
      `[clonarDocumentosClienteArchivo] Cliente ${clienteId} → solicitud ${solicitudIdNueva}: ${filas.length}/${documentosCliente.length} documento(s) clonados (duplicados)`,
    );
  }

  private async verificarDocumentosVencidos(
    clienteId: number,
  ): Promise<boolean> {
    // Sin catch: si la verificación falla, la ampliación no se crea (antes
    // asumía "vencidos" y seguía).
    const tieneVencidos =
      await this.clienteArchivoService.tieneDocumentosVencidos(clienteId);
    this.logger.log(
      `Verificación documentos cliente ${clienteId}: ${tieneVencidos ? 'VENCIDOS' : 'VIGENTES'}`,
    );
    return tieneVencidos;
  }

  async findAll() {
    this.logger.log('Fetching all ampliaciones-cupo');
    return this.dataSource.query(`
      SELECT ${CAMPOS_SOLICITUD_AMPLIACION}
      FROM solicitudes
      WHERE sol_cupo_solicitado IS NOT NULL
      ORDER BY sol_id DESC
    `);
  }

  async findOne(solId: number) {
    this.logger.log(`Finding ampliacion-cupo (solicitud ${solId})`);

    const [fila] = await this.dataSource.query(
      `SELECT ${CAMPOS_SOLICITUD_AMPLIACION}
       FROM solicitudes
       WHERE sol_id = @0 AND sol_cupo_solicitado IS NOT NULL`,
      [solId],
    );

    if (!fila) {
      throw new NotFoundException(
        `Ampliación de cupo (solicitud ${solId}) no encontrada`,
      );
    }

    return fila;
  }

  async findByCliente(clienteId: number) {
    this.logger.log(`Finding ampliaciones-cupo for cliente ${clienteId}`);

    return this.dataSource.query(
      `SELECT ${CAMPOS_SOLICITUD_AMPLIACION}
       FROM solicitudes
       WHERE sol_cli_id = @0 AND sol_cupo_solicitado IS NOT NULL
       ORDER BY sol_id DESC`,
      [clienteId],
    );
  }

  // El cupo y la justificación solo se pueden cambiar mientras la solicitud
  // sigue en trámite: una vez aprobada o rechazada, ya se decidió sobre ellos.
  private async verificarEnTramite(solId: number) {
    const [fila] = await this.dataSource.query(
      `SELECT se.ses_codigo, se.ses_nombre
       FROM solicitudes s
       JOIN solicitud_estados se ON se.ses_id = s.sol_ses_id
       WHERE s.sol_id = @0`,
      [solId],
    );
    if (!['BORRADOR', 'PENDIENTE', 'REVISION'].includes(fila.ses_codigo)) {
      throw new ConflictException(
        `La solicitud ${solId} está en estado ${fila.ses_nombre}; solo se puede modificar mientras está en trámite.`,
      );
    }
  }

  async update(solId: number, dto: UpdateAmpliacionCupoDto) {
    this.logger.log(`Updating ampliacion-cupo (solicitud ${solId})`);

    await this.findOne(solId);
    await this.verificarEnTramite(solId);

    const sets: string[] = [];
    const params: any[] = [];

    if (dto.nuevoCupo !== undefined) {
      sets.push(`sol_cupo_solicitado = @${params.length}`);
      params.push(dto.nuevoCupo);
    }
    if (dto.justificacion !== undefined) {
      sets.push(`sol_justificacion_ampliacion = @${params.length}`);
      params.push(dto.justificacion);
    }

    if (sets.length > 0) {
      params.push(solId);
      await this.dataSource.query(
        `UPDATE solicitudes SET ${sets.join(', ')} WHERE sol_id = @${params.length - 1}`,
        params,
      );
    }

    return this.findOne(solId);
  }

  async remove(solId: number): Promise<void> {
    this.logger.log(`Removing ampliacion-cupo flag from solicitud ${solId}`);

    await this.findOne(solId);
    await this.verificarEnTramite(solId);

    await this.dataSource.query(
      `UPDATE solicitudes
       SET sol_cupo_solicitado = NULL, sol_justificacion_ampliacion = NULL
       WHERE sol_id = @0`,
      [solId],
    );
  }
}
