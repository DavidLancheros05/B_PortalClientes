import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateAmpliacionCupoDto, UpdateAmpliacionCupoDto } from './dto';

const CAMPOS_SOLICITUD_AMPLIACION = `
  sol_id, sol_cliente_id, sol_cupo_solicitado, sol_justificacion_ampliacion,
  sol_estado_id, sol_etapa_actual_id, sol_resultado_etapa_id,
  sol_numero_solicitud, sol_created_at
`;

@Injectable()
export class AmpliacionCupoService {
  private readonly logger = new Logger('AmpliacionCupoService');

  constructor(private readonly dataSource: DataSource) {}

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
        `SELECT TOP 1 cop_id
         FROM Detalle_cliente_centro
         WHERE cli_id = @0 AND dclc_estado = 'A'
         ORDER BY dclc_fecha_usr DESC`,
        [dto.clienteId],
      );

      if (!coResult || coResult.length === 0) {
        throw new Error(
          `Cliente ${dto.clienteId} no tiene centro de operación asignado`,
        );
      }

      const coId = coResult[0].cop_id;

      // 3. Obtener número de solicitud
      const numeroSolicitud = await this.obtenerSiguienteNumeroSolicitud(
        coId,
        queryRunner,
      );

      // 4. Obtener última versión del formulario
      const formularioResult = await queryRunner.query(`
        SELECT TOP 1 MAX(fv.fv_numero) AS formulario_version
        FROM Formulario_versiones fv
        INNER JOIN formularios f ON fv.fv_frm_id = f.frm_id
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
          sol_cupo_solicitado, sol_justificacion_ampliacion
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @15
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

  private async verificarDocumentosVencidos(
    clienteId: number,
  ): Promise<boolean> {
    try {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      // Query para obtener documentos vencidos de la última solicitud del cliente
      const result = await this.dataSource.query(
        `
        SELECT TOP 1 sa.sa_id
        FROM Solicitud_archivo sa
        INNER JOIN solicitudes s ON sa.sa_sol_id = s.sol_id
        WHERE s.sol_cliente_id = @0
          AND sa.sa_fecha_vencimiento IS NOT NULL
          AND sa.sa_fecha_vencimiento < @1
          AND sa.sa_estado = 'activo'
        ORDER BY s.sol_id DESC
        `,
        [clienteId, hoy],
      );

      const tieneVencidos = result && result.length > 0;
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
