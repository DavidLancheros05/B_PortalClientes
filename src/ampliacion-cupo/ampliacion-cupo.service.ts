import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AmpliacionCupoEntity } from './entities';
import { CreateAmpliacionCupoDto, UpdateAmpliacionCupoDto } from './dto';

@Injectable()
export class AmpliacionCupoService {
  private readonly logger = new Logger('AmpliacionCupoService');

  constructor(
    @InjectRepository(AmpliacionCupoEntity)
    private readonly repo: Repository<AmpliacionCupoEntity>,
    private readonly dataSource: DataSource,
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

  async create(dto: CreateAmpliacionCupoDto): Promise<AmpliacionCupoEntity> {
    this.logger.log(`Creating ampliacion-cupo for cliente ${dto.clienteId}`);

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

      // 6. Crear solicitud
      const now = new Date();
      const insertSolicitudSQL = `
        INSERT INTO solicitudes (
          sol_cliente_id, sol_estado_id, sol_co_id,
          sol_nit_documento, sol_fecha_creacion, sol_created_at, sol_updated_at,
          sol_version, sol_formulario_version, sol_numero_solicitud, sol_es_zona_franca,
          sol_ejecutivo_id, sol_etapa_actual_id, sol_resultado_etapa_id
        ) VALUES (
          @0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13
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
         (swh_solicitud_id, swh_etapa_id, swh_resultado_id, swh_fecha)
         VALUES (@0, @1, @2, @3)`,
        [solicitudId, etapaId, resultadoId, now],
      );

      // 8. Crear registro en ampliacion_cupo
      const entity = this.repo.create({
        ac_cliente_id: dto.clienteId,
        ac_nuevo_cupo: dto.nuevoCupo,
        ac_justificacion: dto.justificacion,
        ac_solicitud_anterior_id: dto.solicitudAnteriorId || null,
        ac_solicitud_id: solicitudId,
        ac_estado_id: estadoId,
        ac_etapa_actual_id: etapaId,
        ac_resultado_etapa_id: resultadoId,
      });

      const savedEntity = await this.repo.save(entity);

      await queryRunner.commitTransaction();
      return savedEntity;
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

  async findAll(): Promise<AmpliacionCupoEntity[]> {
    this.logger.log('Fetching all ampliaciones-cupo');
    return await this.repo.find({
      order: { ac_id: 'DESC' },
    });
  }

  async findOne(id: number): Promise<AmpliacionCupoEntity> {
    this.logger.log(`Finding ampliacion-cupo ${id}`);

    const entity = await this.repo.findOne({
      where: { ac_id: id },
    });

    if (!entity) {
      throw new NotFoundException(`Ampliacion-cupo con id ${id} no encontrado`);
    }

    return entity;
  }

  async findByCliente(clienteId: number): Promise<AmpliacionCupoEntity[]> {
    this.logger.log(`Finding ampliaciones-cupo for cliente ${clienteId}`);

    return await this.repo.find({
      where: { ac_cliente_id: clienteId },
      order: { ac_id: 'DESC' },
    });
  }

  async update(
    id: number,
    dto: UpdateAmpliacionCupoDto,
  ): Promise<AmpliacionCupoEntity> {
    this.logger.log(`Updating ampliacion-cupo ${id}`);

    await this.findOne(id);

    const updateData: any = {};
    if (dto.clienteId !== undefined) updateData.ac_cliente_id = dto.clienteId;
    if (dto.nuevoCupo !== undefined) updateData.ac_nuevo_cupo = dto.nuevoCupo;
    if (dto.justificacion !== undefined)
      updateData.ac_justificacion = dto.justificacion;
    if (dto.solicitudAnteriorId !== undefined)
      updateData.ac_solicitud_anterior_id = dto.solicitudAnteriorId;

    await this.repo.update(id, updateData);

    return await this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    this.logger.log(`Deleting ampliacion-cupo ${id}`);

    await this.findOne(id);
    await this.repo.delete(id);
  }
}
