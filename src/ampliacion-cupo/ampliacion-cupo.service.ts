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
import { IStorageService, STORAGE_SERVICE } from '../common/storage/storage.interface';

const CAMPOS_SOLICITUD_AMPLIACION = `
  sol_id, sol_cliente_id, sol_cupo_solicitado, sol_cupo_actual_referencia,
  sol_justificacion_ampliacion, sol_consumo_mensual_proyectado, sol_toneladas_proyectadas,
  sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id,
  sol_numero_solicitud, sol_created_at
`;

// Estados "en trámite" (ver FRONTEND/src/constants/estado-solicitud.ts):
// BORRADOR, PENDIENTE, REVISION. No incluye COMPLETADA/APROBADA/RECHAZADA.
const ESTADOS_EN_TRAMITE = [1, 2, 3];

@Injectable()
export class AmpliacionCupoService {
  private readonly logger = new Logger('AmpliacionCupoService');

  constructor(
    private readonly dataSource: DataSource,
    private readonly clienteArchivoService: ClienteArchivoService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  private async obtenerSiguienteNumeroSolicitud(
    copId: number,
    queryRunner: any,
  ): Promise<string> {
    const result = await queryRunner.query(
      `DECLARE @numero_solicitud INT;
       EXEC sp_ObtenerSiguienteNumeroSolicitud @cop_id = @0, @numero_solicitud = @numero_solicitud OUTPUT;
       SELECT @numero_solicitud as numero_solicitud;`,
      [copId],
    );

    if (result && result.length > 0) {
      return String(result[0].numero_solicitud);
    }

    throw new Error('No se pudo generar el número de solicitud');
  }

  async create(dto: CreateAmpliacionCupoDto, usuarioId: number) {
    this.logger.log(`Creating ampliacion-cupo for cliente ${dto.clienteId}`);

    // Nota: dto.solicitudAnteriorId se acepta pero no se persiste — no hay
    // columna dedicada para eso; la solicitud anterior de un cliente ya es
    // recuperable consultando `solicitudes` por sol_cliente_id.

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 0. Bloquear si el cliente ya tiene una solicitud en trámite (mismo
      // criterio que el bloqueo de "Nueva solicitud" del cliente en
      // SolicitudFormContent.tsx) — sin esto, el Ejecutivo podía crear
      // ampliaciones duplicadas para el mismo cliente mientras una ya
      // estaba pendiente/en revisión.
      const enTramite = await queryRunner.query(
        `SELECT TOP 1 sol_id, sol_numero_solicitud
         FROM solicitudes
         WHERE sol_cliente_id = @0 AND sol_estado_id IN (${ESTADOS_EN_TRAMITE.join(',')})
         ORDER BY sol_id DESC`,
        [dto.clienteId],
      );

      if (enTramite && enTramite.length > 0) {
        throw new ConflictException(
          `El cliente ya tiene una solicitud en trámite (${enTramite[0].sol_numero_solicitud}). ` +
            `Debe resolverse antes de crear una nueva ampliación de cupo.`,
        );
      }

      // 1. Verificar documentos vencidos de la última solicitud
      const tieneDocumentosVencidos = await this.verificarDocumentosVencidos(
        dto.clienteId,
      );

      let estadoId: number;
      let etapaId: number;

      if (tieneDocumentosVencidos) {
        this.logger.log(
          `Cliente ${dto.clienteId} tiene documentos vencidos - asignando a Cliente`,
        );
        estadoId = 2; // PENDIENTE
      } else {
        this.logger.log(
          `Cliente ${dto.clienteId} sin documentos vencidos - asignando a Oficial de Cumplimiento`,
        );
        estadoId = 3; // EN REVISIÓN
      }

      // 2. Obtener cliente
      const clienteResult = await queryRunner.query(
        `SELECT ejng_id, cli_nro_identificacion
         FROM clientes WHERE cli_id = @0`,
        [dto.clienteId],
      );

      if (!clienteResult || clienteResult.length === 0) {
        throw new Error(`Cliente ${dto.clienteId} no encontrado`);
      }

      const ejecutivoId = clienteResult[0].ejng_id;
      const nitCliente = clienteResult[0].cli_nro_identificacion;

      // 2.1 Obtener centro de operación del cliente (el primero asignado)
      const coResult = await queryRunner.query(
        `SELECT TOP 1 dcc.cop_id, co.cop_nombre
         FROM Detalle_cliente_centro dcc
         JOIN Centro_operacion co ON co.cop_id = dcc.cop_id
         WHERE dcc.cli_id = @0 AND dcc.dclc_estado = 'A'
         ORDER BY dcc.dclc_fecha_usr DESC`,
        [dto.clienteId],
      );

      if (!coResult || coResult.length === 0) {
        throw new Error(
          `Cliente ${dto.clienteId} no tiene centro de operación asignado`,
        );
      }

      const coId = coResult[0].cop_id;
      const copNombre = coResult[0].cop_nombre;

      // 3. Obtener número de solicitud
      const numeroSolicitud = await this.obtenerSiguienteNumeroSolicitud(
        coId,
        queryRunner,
      );

      // 4. Obtener versión activa del formulario (fijada a mano con
      // activarVersion, o si nadie la fijó, la más reciente)
      const formularioResult = await queryRunner.query(`
        SELECT TOP 1 ISNULL(
          f.frm_version_activa,
          (SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frm_id = f.frm_id)
        ) AS formulario_version
        FROM formularios f
        WHERE f.frm_activo = 1
      `);
      const formularioVersion = Number(
        formularioResult?.[0]?.formulario_version ?? 1,
      );

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

      // Seleccionar etapa según estado
      etapaId = estadoId === 2 ? etapaClienteId : etapaOFCId;

      // 6. Crear solicitud (incluye el monto y la justificación de la
      // ampliación directamente en sus propias columnas — ver migración
      // 20260719_agregar_cupo_solicitado_a_solicitudes.sql)
      const now = new Date();
      const insertSolicitudSQL = `
        INSERT INTO solicitudes (
          sol_cliente_id, sol_estado_id, sol_co_id,
          sol_nit_documento, sol_fecha_creacion, sol_created_at, sol_updated_at,
          sol_version, sol_formulario_version, sol_numero_solicitud, sol_es_zona_franca,
          sol_ejecutivo_id, sol_etapa_actual_id, sol_resultado_etapa_id,
          sol_cupo_solicitado, sol_justificacion_ampliacion, sol_cupo_actual_referencia,
          sol_consumo_mensual_proyectado, sol_toneladas_proyectadas
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @15, @16, @17, @18
        );
        SELECT SCOPE_IDENTITY() AS sol_id;
      `;

      const solicitudParams = [
        dto.clienteId, // @0
        estadoId, // @1 (2=PENDIENTE, 3=EN REVISIÓN)
        coId, // @2
        nitCliente, // @3
        now, // @4 fecha_creacion
        now, // @5 created_at
        now, // @6 updated_at
        1, // @7 version
        formularioVersion, // @8 formulario_version
        numeroSolicitud, // @9 numero_solicitud
        0, // @10 es_zona_franca
        ejecutivoId, // @11 ejecutivo_id
        etapaId, // @12 etapa_actual_id
        resultadoId, // @13 resultado_etapa_id
        dto.nuevoCupo, // @14 cupo_solicitado
        dto.justificacion, // @15 justificacion_ampliacion
        dto.cupoActualReferencia ?? null, // @16 cupo_actual_referencia
        dto.consumoMensualProyectado, // @17 consumo_mensual_proyectado
        dto.toneladasProyectadas, // @18 toneladas_proyectadas
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

      // 6.1 Llenar también las respuestas de formulario equivalentes
      // (Tipo de solicitud, ¿Solicita crédito?, Cupo solicitado) — a pedido
      // del usuario, para que las pantallas/widgets que leen
      // Formulario_respuesta (useSolicitudCupoSolicitado, PDF de la
      // solicitud, etc.) funcionen igual que si el cliente hubiera
      // diligenciado el formulario, sin depender de un caso especial.
      await this.guardarRespuestasFormularioAmpliacion(
        queryRunner,
        solicitudId,
        formularioVersion,
        dto.nuevoCupo,
        dto.consumoMensualProyectado,
        dto.toneladasProyectadas,
        usuarioId,
      );

      // 6.2 Clonar el resto de respuestas de la última solicitud aprobada
      // del cliente (identificación, representante legal, PEPs, etc.) — a
      // pedido del usuario: sin esto, esta solicitud quedaba con solo 3
      // respuestas de ~60, y cualquier documento/PDF que lea el formulario
      // completo (ej. "Manifestación suscrita", con
      // {{representante_legal_nombre}}) salía en blanco.
      await this.clonarRespuestasUltimaAprobada(
        queryRunner,
        dto.clienteId,
        solicitudId,
        formularioVersion,
        usuarioId,
      );

      // 6.3 Clonar los documentos vigentes del cliente (Cliente_archivo)
      // hacia Solicitud_archivo de ESTA solicitud — solo cuando no hay
      // vencidos (por eso se saltó a Oficial de Cumplimiento en el paso 3):
      // esos documentos ya se dieron por verificados, así que la nueva
      // solicitud debe quedar con su propio Solicitud_archivo real, igual
      // que si el cliente los hubiera vuelto a subir. Si hay vencidos, la
      // solicitud queda en etapa Cliente y es el cliente quien sube lo que
      // falta directo a esta solicitud — no hay nada que clonar todavía.
      if (!tieneDocumentosVencidos) {
        await this.clonarDocumentosClienteArchivo(
          queryRunner,
          dto.clienteId,
          solicitudId,
          formularioVersion,
          copNombre,
          numeroSolicitud,
        );
      }

      // 7. Registrar en workflow_historial
      await queryRunner.query(
        `INSERT INTO solicitud_workflow_historial
         (swh_sol_id, swh_etapa_id, swh_resultado_id, swh_usuario_id, swh_fecha)
         VALUES (@0, @1, @2, @3, @4)`,
        [solicitudId, etapaId, resultadoId, usuarioId, now],
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
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Mismo patrón que SolicitudesWorkflowService.guardarRespuestasConceptoEjecutivo/
  // guardarRespuestasUsoExclusivo: escribe Formulario_respuesta directamente
  // desde código (no desde un submit real), resolviendo preguntas por
  // fp_codigo (estable entre versiones) y opciones SELECT por fpo_valor.
  private async guardarRespuestasFormularioAmpliacion(
    queryRunner: any,
    solicitudId: number,
    formularioVersion: number,
    nuevoCupo: number,
    consumoMensualProyectado: number,
    toneladasProyectadas: number,
    usuarioId: number,
  ): Promise<void> {
    try {
      const preguntas: { fp_id: number; fp_codigo: string }[] =
        await queryRunner.query(
          `SELECT fp_id, fp_codigo FROM Formulario_pregunta
           WHERE fp_codigo IN ('TIPO_SOLICITUD', 'SOLICITA_CREDITO', 'CUPO_SOLICITADO')
             AND fp_estado = 1 AND ISNULL(fp_version, 1) = @0`,
          [formularioVersion],
        );

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
           WHERE fr_solicitud_id = @0 AND fr_fp_id = @1`,
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
               (fr_solicitud_id, fr_fp_id, fr_valor_texto, fr_valor_numero,
                fr_valor_opcion_id, fr_actualizado_por, fr_completado, fr_created_at)
             VALUES (@4, @5, @0, @1, @2, @3, 1, GETDATE())`,
            [...params, solicitudId, fp_id],
          );
        }
      };

      const buscarOpcion = async (fp_id: number, valorEsperado: string) => {
        const [opcion] = await queryRunner.query(
          `SELECT fpo_id FROM Formulario_pregunta_opcion
           WHERE fpo_fp_id = @0 AND UPPER(fpo_valor) = @1 AND fpo_estado = 1`,
          [fp_id, valorEsperado.toUpperCase()],
        );
        return opcion?.fpo_id as number | undefined;
      };

      const tipoSolicitud = preguntas.find((p) => p.fp_codigo === 'TIPO_SOLICITUD');
      if (tipoSolicitud) {
        const fpoId = await buscarOpcion(tipoSolicitud.fp_id, 'Ampliacion de cupo');
        if (fpoId) await upsert(tipoSolicitud.fp_id, { opcionId: fpoId });
      }

      const solicitaCredito = preguntas.find((p) => p.fp_codigo === 'SOLICITA_CREDITO');
      if (solicitaCredito) {
        const fpoId = await buscarOpcion(solicitaCredito.fp_id, 'Si');
        if (fpoId) await upsert(solicitaCredito.fp_id, { opcionId: fpoId });
      }

      const cupoSolicitado = preguntas.find((p) => p.fp_codigo === 'CUPO_SOLICITADO');
      if (cupoSolicitado) {
        await upsert(cupoSolicitado.fp_id, { numero: nuevoCupo });
      }

      // Sección "CONCEPTO DEL EJECUTIVO DE NEGOCIOS" (oculta al cliente):
      // Camino 2 nunca pasa por "Registrar Concepto"
      // (SolicitudesWorkflowService.guardarRespuestasConceptoEjecutivo), así
      // que sin esto el PDF completo de la solicitud y cualquier plantilla
      // que lea estas preguntas quedaban con "Consumo mes proyectado"/
      // "Toneladas mes proyectado" en blanco. Se resuelve por nombre de
      // sección + descripción, igual que el método hermano, porque esas
      // preguntas no tienen fp_codigo asignado.
      const preguntasConcepto: { fp_id: number; fp_descripcion: string }[] =
        await queryRunner.query(
          `SELECT fp.fp_id, fp.fp_descripcion
           FROM Formulario_pregunta fp
           JOIN Formulario_secciones fs ON fs.fs_id = fp.seccion_id
           WHERE fs.fs_nombre LIKE 'CONCEPTO DEL EJECUTIVO%' AND fp.fp_estado = 1
             AND ISNULL(fp.fp_version, 1) = @0`,
          [formularioVersion],
        );
      const porDescripcion = (texto: string) =>
        preguntasConcepto.find(
          (p) =>
            p.fp_descripcion.trim().replace(/:$/, '').toUpperCase() ===
            texto.toUpperCase(),
        );

      const consumoPregunta = porDescripcion('Consumo mes proyectado');
      if (consumoPregunta) {
        await upsert(consumoPregunta.fp_id, { numero: consumoMensualProyectado });
      }

      const toneladasPregunta = porDescripcion('Toneladas mes proyectado');
      if (toneladasPregunta) {
        await upsert(toneladasPregunta.fp_id, { numero: toneladasProyectadas });
      }
    } catch (error) {
      // No debe tumbar la creación de la solicitud si esto falla — las
      // columnas sol_cupo_solicitado/sol_justificacion_ampliacion (fuente de
      // verdad) ya quedaron guardadas antes de llegar aquí.
      this.logger.error(
        '[guardarRespuestasFormularioAmpliacion] Error llenando respuestas de formulario:',
        error,
      );
    }
  }

  // Clona el resto de respuestas de la última solicitud aprobada del
  // cliente hacia la nueva (identificación, representante legal, PEPs,
  // accionistas, contactos, despachos, etc.) — mismo criterio de qué copiar
  // que usePrefillConfiguracion en el Camino 1 (FRONTEND), pero aplicado
  // aquí en el servidor porque el Camino 2 no pasa por ese formulario.
  //
  // Reutiliza fp_precarga_fuente ('ultima_solicitud'/'cliente_primero')
  // como criterio de qué copiar — es la misma bandera que ya excluye
  // documentos/firmas/notas (nunca se les activó) y, desde la migración
  // 20260802_quitar_precarga_funcionario_y_cupo_solicitado.sql, también
  // excluye Nombre/Cargo del Funcionario y Cupo Solicitado. Así el criterio
  // de "qué se puede heredar" queda en un solo lugar (la BD), no duplicado
  // en código.
  private async clonarRespuestasUltimaAprobada(
    queryRunner: any,
    clienteId: number,
    solicitudIdNueva: number,
    formularioVersion: number,
    usuarioId: number,
  ): Promise<void> {
    try {
      const [ultimaAprobada] = await queryRunner.query(
        `SELECT TOP 1 sol_id FROM solicitudes
         WHERE sol_cliente_id = @0 AND sol_estado_id = 5
         ORDER BY sol_fecha_creacion DESC`,
        [clienteId],
      );
      if (!ultimaAprobada) return;

      // Preguntas de la versión NUEVA (destino) elegibles para heredar
      // valor — el criterio (fp_precarga_fuente) se evalúa aquí, sobre la
      // fila de la versión NUEVA, no sobre la fila vieja de la solicitud
      // origen: fp_precarga_fuente es una columna por versión, y las
      // migraciones que la activaron (20260727_activar_precarga_...,
      // 20260802_quitar_precarga_...) solo tocaron la versión activa — una
      // solicitud vieja diligenciada contra otra versión puede tener esa
      // bandera desactualizada o nunca configurada.
      const preguntasNuevas: {
        fp_id: number;
        fp_codigo: string;
        fp_tipo: string;
      }[] = await queryRunner.query(
        `SELECT fp_id, fp_codigo, fp_tipo FROM Formulario_pregunta
         WHERE fp_estado = 1 AND ISNULL(fp_version, 1) = @0
           AND fp_codigo IS NOT NULL
           AND fp_precarga_fuente IN ('ultima_solicitud', 'cliente_primero')
           AND fp_codigo NOT IN ('TIPO_SOLICITUD', 'SOLICITA_CREDITO', 'CUPO_SOLICITADO')
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
        fr_created_at: string;
        fp_codigo: string;
        fpo_codigo: string | null;
      }[] = await queryRunner.query(
        `SELECT fr.fr_fp_id, fr.fr_valor_texto, fr.fr_valor_numero, fr.fr_valor_fecha,
                fr.fr_valor_opcion_id, fr.fr_created_at, fp.fp_codigo, fpo.fpo_codigo
         FROM Formulario_respuesta fr
         JOIN Formulario_pregunta fp ON fp.fp_id = fr.fr_fp_id
         LEFT JOIN Formulario_pregunta_opcion fpo ON fpo.fpo_id = fr.fr_valor_opcion_id
         WHERE fr.fr_solicitud_id = @0`,
        [ultimaAprobada.sol_id],
      );

      // Agrupar por pregunta de origen y quedarnos solo con el guardado más
      // reciente (una pregunta MULTISELECT puede tener varias filas de un
      // mismo guardado, a milisegundos de diferencia — mismo criterio de
      // tolerancia de 2s que agruparUltimaRespuestaPorPregunta.ts).
      const porFpIdOrigen = new Map<number, typeof respuestas>();
      for (const r of respuestas) {
        const lista = porFpIdOrigen.get(r.fr_fp_id) ?? [];
        lista.push(r);
        porFpIdOrigen.set(r.fr_fp_id, lista);
      }

      for (const filas of porFpIdOrigen.values()) {
        const nueva = nuevaPorCodigo.get(filas[0].fp_codigo);
        if (!nueva) continue; // la pregunta ya no existe en esta versión

        const maxTiempo = Math.max(
          ...filas.map((f) => new Date(f.fr_created_at ?? 0).getTime()),
        );
        const filasUltimoGuardado = filas.filter(
          (f) => maxTiempo - new Date(f.fr_created_at ?? 0).getTime() < 2000,
        );

        const insertarFila = async (fila: (typeof respuestas)[number]) => {
          let opcionId: number | null = null;
          if (fila.fr_valor_opcion_id) {
            if (!fila.fpo_codigo) return; // opción sin identidad estable, no se traduce con seguridad
            const [opcion] = await queryRunner.query(
              `SELECT fpo_id FROM Formulario_pregunta_opcion
               WHERE fpo_fp_id = @0 AND fpo_codigo = @1 AND fpo_estado = 1`,
              [nueva.fp_id, fila.fpo_codigo],
            );
            if (!opcion) return; // la opción ya no existe en esta versión
            opcionId = opcion.fpo_id;
          }
          await queryRunner.query(
            `INSERT INTO Formulario_respuesta
               (fr_solicitud_id, fr_fp_id, fr_valor_texto, fr_valor_numero, fr_valor_fecha,
                fr_valor_opcion_id, fr_actualizado_por, fr_completado, fr_created_at)
             VALUES (@0, @1, @2, @3, @4, @5, @6, 1, GETDATE())`,
            [
              solicitudIdNueva,
              nueva.fp_id,
              fila.fr_valor_texto,
              fila.fr_valor_numero,
              fila.fr_valor_fecha,
              opcionId,
              usuarioId,
            ],
          );
        };

        if (nueva.fp_tipo === 'MULTISELECT') {
          for (const fila of filasUltimoGuardado) await insertarFila(fila);
        } else {
          // Resto de tipos: una sola respuesta, la más reciente del grupo.
          const fila = filasUltimoGuardado.reduce((latest, f) =>
            new Date(f.fr_created_at ?? 0).getTime() >
            new Date(latest.fr_created_at ?? 0).getTime()
              ? f
              : latest,
          );
          await insertarFila(fila);
        }
      }
    } catch (error) {
      // No debe tumbar la creación de la solicitud si esto falla — el
      // cliente sigue quedando con las 3 respuestas mínimas y las columnas
      // sol_cupo_solicitado/etc., que son la fuente de verdad real.
      this.logger.error(
        '[clonarRespuestasUltimaAprobada] Error clonando respuestas:',
        error,
      );
    }
  }

  // Copia los documentos vigentes del cliente (Cliente_archivo) hacia
  // Solicitud_archivo de la nueva solicitud, ligados a la pregunta
  // DOCUMENTOS_TABLA correspondiente en la versión de formulario destino
  // (misma traducción por Tipos_documentos que usa promoverDocumentos en
  // sentido inverso). Deja la solicitud con documentos propios reales, en
  // vez de depender de que las pantallas de revisión hagan un fallback de
  // solo-lectura a Cliente_archivo cuando Solicitud_archivo está vacío.
  private async clonarDocumentosClienteArchivo(
    queryRunner: any,
    clienteId: number,
    solicitudIdNueva: number,
    formularioVersion: number,
    copNombre: string,
    numeroSolicitud: string,
  ): Promise<void> {
    try {
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

      const preguntasDocumento: { fp_id: number; fp_tipo_documento_id: number }[] =
        await queryRunner.query(
          `SELECT fp_id, fp_tipo_documento_id FROM Formulario_pregunta
           WHERE fp_estado = 1 AND ISNULL(fp_version, 1) = @0
             AND fp_tipo_documento_id IS NOT NULL`,
          [formularioVersion],
        );
      const fpIdPorTdoId = new Map(
        preguntasDocumento.map((p) => [p.fp_tipo_documento_id, p.fp_id]),
      );

      const carpetaDestino = `documentos-solicitudes/${copNombre}/formularios/${numeroSolicitud}`;
      let clonados = 0;

      for (const doc of documentosCliente) {
        const fpId = fpIdPorTdoId.get(doc.ca_tdo_id);
        if (!fpId) continue; // este tipo de documento no existe (o cambió) en la versión destino

        // Duplicado real (no solo copiar la URL de Cliente_archivo): esta
        // solicitud debe tener su propio asset en Cloudinary, para que
        // reemplazar/eliminar el documento acá no rompa el archivo
        // consolidado del cliente ni viceversa. Mismo mecanismo que
        // ClienteArchivoService.promoverDocumentos.
        let duplicado;
        try {
          duplicado = await this.storageService.duplicate(
            doc.ca_ruta_almacenamiento,
            {
              folder: carpetaDestino,
              filename: doc.ca_nombre_original,
              resourceType: doc.ca_resource_type || 'raw',
            },
          );
        } catch (error) {
          this.logger.error(
            `[clonarDocumentosClienteArchivo] No se pudo duplicar tdo_id=${doc.ca_tdo_id} — se omite:`,
            error,
          );
          continue;
        }

        await queryRunner.query(
          // sa_nombre_guardado es NOT NULL sin default (columna pensada para
          // subidas a disco local, no aplica a un documento clonado desde
          // Cliente_archivo) — se reutiliza el nombre original solo para
          // satisfacer la restricción.
          `INSERT INTO Solicitud_archivo
             (sa_sol_id, sa_fp_id, sa_nombre_original, sa_nombre_guardado, sa_tipo_mime,
              sa_ruta_almacenamiento, sa_cloudinary_public_id, sa_resource_type,
              sa_estado, sa_created_at, sa_fecha_emision, sa_fecha_vencimiento)
           VALUES (@0, @1, @2, @3, @4, @5, @6, @7, 'activo', GETDATE(), @8, @9)`,
          [
            solicitudIdNueva,
            fpId,
            doc.ca_nombre_original,
            doc.ca_nombre_original,
            doc.ca_tipo_mime,
            duplicado.url,
            duplicado.providerId,
            duplicado.resourceType,
            doc.ca_fecha_emision,
            doc.ca_fecha_vencimiento,
          ],
        );

        clonados++;
      }

      this.logger.log(
        `[clonarDocumentosClienteArchivo] Cliente ${clienteId} → solicitud ${solicitudIdNueva}: ${clonados}/${documentosCliente.length} documento(s) clonados (duplicados)`,
      );
    } catch (error) {
      // No debe tumbar la creación de la solicitud si esto falla — el
      // fallback de lectura en SolicitudesDocumentosService.obtenerDocumentosConVigencia
      // sigue mostrando los documentos de Cliente_archivo aunque no se hayan
      // podido clonar.
      this.logger.error(
        '[clonarDocumentosClienteArchivo] Error clonando documentos:',
        error,
      );
    }
  }

  // Antes miraba Solicitud_archivo de la última solicitud puntual del
  // cliente; ahora mira el archivo consolidado del cliente (Cliente_archivo),
  // que se promueve una sola vez al aprobarse cada solicitud en CC2 — no
  // depende de en qué solicitud puntual se subió cada documento por última
  // vez. Ver documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md.
  private async verificarDocumentosVencidos(
    clienteId: number,
  ): Promise<boolean> {
    try {
      const tieneVencidos =
        await this.clienteArchivoService.tieneDocumentosVencidos(clienteId);
      this.logger.log(
        `Verificación documentos cliente ${clienteId}: ${tieneVencidos ? 'VENCIDOS' : 'VIGENTES'}`,
      );
      return tieneVencidos;
    } catch (error) {
      this.logger.error(
        `Error verificando documentos vencidos para cliente ${clienteId}:`,
        error,
      );
      // En caso de error, asumir que hay documentos vencidos (más conservador)
      return true;
    }
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
       WHERE sol_cliente_id = @0 AND sol_cupo_solicitado IS NOT NULL
       ORDER BY sol_id DESC`,
      [clienteId],
    );
  }

  async update(solId: number, dto: UpdateAmpliacionCupoDto) {
    this.logger.log(`Updating ampliacion-cupo (solicitud ${solId})`);

    await this.findOne(solId);

    // clienteId / solicitudAnteriorId no se persisten: cambiar el cliente
    // dueño de una solicitud ya creada no tiene sentido, y la solicitud
    // anterior es recuperable por consulta (ver nota en create()).
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

    // No se borra la solicitud (tiene workflow/historial real) — solo se
    // le quita la marca de "es una ampliación de cupo".
    await this.dataSource.query(
      `UPDATE solicitudes
       SET sol_cupo_solicitado = NULL, sol_justificacion_ampliacion = NULL
       WHERE sol_id = @0`,
      [solId],
    );
  }
}
