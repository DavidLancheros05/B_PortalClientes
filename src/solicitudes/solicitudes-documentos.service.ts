// src/solicitudes/solicitudes-documentos.service.ts
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TABLAS, COLUMNAS } from '../common/constants/tablas.constants';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../common/storage/storage.interface';

@Injectable()
export class SolicitudesDocumentosService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async obtenerSolicitud(id: number) {
    console.log(`📋 [obtenerSolicitud] Obteniendo solicitud con ID: ${id}`);
    try {
      const sql = `
        SELECT
          s.*,
          c.cli_razon_social as cliente_nombre,
          c.cli_nro_identificacion as cliente_nit,
          co.cop_nombre as centro_operacion_nombre,
          u_crea.usr_nombre as usuario_registro,
          u_crea.usr_id as usuario_registro_id,
          u_ej.usr_nombre as ejecutivo_nombre,
          u_ej.usr_id as ejecutivo_id_nombre,
          u_rev.usr_nombre as usuario_revision,
          seh.seh_fecha_hora as fecha_revision
        FROM solicitudes s
        LEFT JOIN clientes c ON s.sol_cliente_id = c.cli_id
        LEFT JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
        LEFT JOIN usuarios u_crea ON s.sol_usuario_crea = u_crea.usr_id
        LEFT JOIN usuarios u_ej ON s.sol_ejecutivo_id = u_ej.usr_id
        LEFT JOIN Solicitudes_estados_hist seh ON s.sol_id = seh.seh_sol_id AND seh.seh_estado_id = 2
        LEFT JOIN usuarios u_rev ON seh.seh_usr_id = u_rev.usr_id
        WHERE s.sol_id = @0
      `;

      const result = await this.dataSource.query(sql, [id]);
      console.log(
        `✅ [obtenerSolicitud] Solicitud encontrada: ${result.length > 0 ? 'SÍ' : 'NO'}`,
      );
      return result[0] || null;
    } catch (error) {
      console.error(
        `❌ [obtenerSolicitud] Error al obtener solicitud ID ${id}:`,
        error,
      );
      throw error;
    }
  }

  async obtenerArchivosExistentes(solicitudId: number) {
    console.log(`Obteniendo archivos existentes: sa_sol_id=${solicitudId}`);

    const sql = `
      SELECT sa.sa_id, sa.sa_sol_id, sa.sa_fp_id AS fp_id, sa.sa_nombre_original, sa.sa_nombre_guardado,
             sa.sa_tamaño_bytes, sa.sa_tipo_mime, sa.sa_ruta_almacenamiento, sa.sa_cargado_por,
             sa.sa_estado, sa.sa_created_at as fecha_carga,
             sa.sa_fecha_emision AS sd_fecha_emision, sa.sa_fecha_vencimiento AS sd_fecha_vencimiento
      FROM Solicitud_archivo sa
      WHERE sa.sa_sol_id = @0 AND sa.sa_estado = 'activo'
      ORDER BY sa.sa_created_at DESC
    `;

    try {
      const archivos = await this.dataSource.query(sql, [solicitudId]);
      console.log(`Archivos encontrados: ${archivos.length}`, archivos);
      return archivos;
    } catch (error) {
      console.error('Error obteniendo archivos existentes:', error);
      throw error;
    }
  }

  async obtenerDocumentosConVigencia(solicitudId: number) {
    const sql = `
      SELECT sa.sa_id, sa.sa_sol_id, sa.sa_fp_id AS fp_id, sa.sa_nombre_original, sa.sa_nombre_guardado,
             sa.sa_tamaño_bytes, sa.sa_tipo_mime, sa.sa_ruta_almacenamiento, sa.sa_cargado_por,
             sa.sa_estado, sa.sa_created_at as fecha_carga,
             sa.sa_fecha_emision AS sd_fecha_emision, sa.sa_fecha_vencimiento AS sd_fecha_vencimiento,
             sa.sa_requiere_cambio AS sd_requiere_cambio,
             td.tdo_id, td.tdo_nombre, td.tdo_vigencia_dias,
             td.tdo_regla_vigencia, td.tdo_anios_atras_permitidos,
             td.tdo_tiene_plantilla, td.tdo_plantilla_contenido, td.tdo_tipo_plantilla,
             td.tdo_formato_codigo, td.tdo_formato_codigo_secundario,
             td.tdo_revision, td.tdo_paginas_total
      FROM Solicitud_archivo sa
      LEFT JOIN Formulario_pregunta fp ON fp.fp_id = sa.sa_fp_id
      LEFT JOIN Tipos_documentos td ON td.tdo_id = fp.fp_tipo_documento_id
      WHERE sa.sa_sol_id = @0 AND sa.sa_estado = 'activo'
      ORDER BY sa.sa_created_at DESC
    `;

    try {
      return await this.dataSource.query(sql, [solicitudId]);
    } catch (error) {
      console.error('Error obteniendo documentos con vigencia:', error);
      throw error;
    }
  }

  // Soportes de análisis: archivos que sube el personal interno (Oficial de
  // Cumplimiento, etc.) para respaldar su revisión — no son documentos del
  // cliente, no están ligados a ninguna pregunta del formulario, por eso no
  // viven en Solicitud_archivo. Reusa storageService.upload igual que
  // guardarRespuestaArchivo.
  async subirSoporteAnalisis(
    solicitudId: number,
    wetId: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
    usuarioId: number,
  ) {
    const [solicitud] = await this.dataSource.query(
      `SELECT s.sol_numero_solicitud, co.cop_nombre
       FROM solicitudes s
       LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
       WHERE s.sol_id = @0`,
      [solicitudId],
    );
    if (!solicitud) {
      throw new Error(`Solicitud ${solicitudId} no encontrada`);
    }

    const carpeta = `documentos-solicitudes/${solicitud.cop_nombre}/soportes/${solicitud.sol_numero_solicitud}`;
    const nombreGuardado = `${Date.now()}_${file.originalname}`;
    const subida = await this.storageService.upload(file.buffer, {
      folder: carpeta,
      filename: nombreGuardado,
      mimetype: file.mimetype,
    });

    const [fila] = await this.dataSource.query(
      `INSERT INTO Solicitud_soporte_analisis
        (ssa_sol_id, ssa_wet_id, ssa_nombre_original, ssa_ruta_almacenamiento, ssa_tipo_mime, ssa_tamano_bytes, ssa_usuario_id)
       OUTPUT INSERTED.*
       VALUES (@0, @1, @2, @3, @4, @5, @6)`,
      [
        solicitudId,
        wetId,
        file.originalname,
        subida.url,
        file.mimetype,
        file.buffer.length,
        usuarioId,
      ],
    );
    return fila;
  }

  async obtenerSoportesAnalisis(solicitudId: number, wetId?: number) {
    const condicionEtapa = wetId ? 'AND ssa.ssa_wet_id = @1' : '';
    const params = wetId ? [solicitudId, wetId] : [solicitudId];
    return this.dataSource.query(
      `SELECT ssa.ssa_id, ssa.ssa_sol_id, ssa.ssa_wet_id, ssa.ssa_nombre_original,
              ssa.ssa_ruta_almacenamiento, ssa.ssa_tipo_mime, ssa.ssa_tamano_bytes,
              ssa.ssa_usuario_id, ssa.ssa_created_at
       FROM Solicitud_soporte_analisis ssa
       WHERE ssa.ssa_sol_id = @0 AND ssa.ssa_estado = 'activo' ${condicionEtapa}
       ORDER BY ssa.ssa_created_at DESC`,
      params,
    );
  }

  async eliminarSoporteAnalisis(solicitudId: number, ssaId: number) {
    await this.dataSource.query(
      `UPDATE Solicitud_soporte_analisis
       SET ssa_estado = 'inactivo'
       WHERE ssa_id = @0 AND ssa_sol_id = @1`,
      [ssaId, solicitudId],
    );
  }

  /**
   * El personal interno (cualquier rol distinto de CLIENTE) puede gestionar
   * archivos de cualquier solicitud (ej. ASC corrigiendo en nombre del
   * cliente). Un usuario CLIENTE solo puede tocar archivos de sus propias
   * solicitudes.
   */
  async verificarAccesoSolicitud(
    solicitudId: number,
    user: { rol?: string; cliente_id?: number; cli_id?: number },
  ): Promise<void> {
    if (user?.rol && user.rol !== 'CLIENTE') {
      return;
    }

    const clienteId = user?.cliente_id ?? user?.cli_id;
    const [row] = await this.dataSource.query(
      `SELECT sol_cliente_id FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );

    if (!row || Number(row.sol_cliente_id) !== Number(clienteId)) {
      throw new ForbiddenException('No tienes acceso a esta solicitud');
    }
  }

  async getDocumentos(mode?: string, usuarioId?: number) {
    console.log('🔴🔴🔴 [getDocumentos] INICIANDO', {
      mode,
      usuarioId,
      timestamp: new Date().toISOString(),
    });

    // Query simplificada para obtener documentos con archivos
    const sql = `
      SELECT
        sa.sa_id,
        sa.sa_sol_id,
        s.sol_numero_solicitud,
        s.sol_estado_id,
        ses.ses_nombre AS estado_solicitud,
        td.tdo_nombre AS documento_nombre,
        sa.sa_nombre_original,
        sa.sa_tipo_mime,
        sa.sa_tamaño_bytes,
        sa.sa_ruta_almacenamiento,
        sa.sa_created_at AS fecha_carga,
        sa.sa_fecha_vencimiento AS sa_fecha_vencimiento,
        CASE
          WHEN sa.sa_fecha_vencimiento IS NULL THEN 'SIN_VIGENCIA'
          WHEN CAST(sa.sa_fecha_vencimiento AS DATE) < CAST(GETDATE() AS DATE) THEN 'VENCIDO'
          ELSE 'VIGENTE'
        END AS estado_vencimiento,
        c.cli_razon_social AS cliente_nombre,
        co.cop_nombre AS centro_operacion_nombre
      FROM Solicitud_archivo sa
      INNER JOIN solicitudes s ON sa.sa_sol_id = s.sol_id
      INNER JOIN solicitud_estados ses ON s.sol_estado_id = ses.ses_id
      LEFT JOIN Formulario_pregunta fp ON fp.fp_id = sa.sa_fp_id
      LEFT JOIN Tipos_documentos td ON td.tdo_id = fp.fp_tipo_documento_id
      INNER JOIN Clientes c ON s.sol_cliente_id = c.cli_id
      INNER JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
      WHERE sa.sa_estado = 'activo'
      ORDER BY sa.sa_created_at DESC
    `;

    try {
      const documentos = await this.dataSource.query(sql);
      console.log('[getDocumentos] Documentos encontrados:', documentos.length);
      return documentos;
    } catch (error) {
      console.error('[getDocumentos] Error:', error);
      throw error;
    }
  }

  async getDocumentosRequeridos(solicitudId: number) {
    const sql = `
      SELECT DISTINCT
        td.${COLUMNAS.TIPOS_DOCUMENTOS.id} AS id,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.nombre} AS nombre,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.descripcion} AS descripcion,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.obligatorio} AS obligatorio
      FROM ${TABLAS.TIPOS_DOCUMENTOS} td
      INNER JOIN Formulario_pregunta fp ON fp.fp_tipo_documento_id = td.${COLUMNAS.TIPOS_DOCUMENTOS.id}
      INNER JOIN solicitudes s ON s.sol_id = @0
      WHERE fp.fp_estado = 1
        AND ISNULL(fp.fp_version, 1) = ISNULL(s.sol_formulario_version, 1)
      ORDER BY td.${COLUMNAS.TIPOS_DOCUMENTOS.nombre} ASC
    `;

    try {
      const documentos = await this.dataSource.query(sql, [solicitudId]);
      return documentos;
    } catch (error) {
      console.error('[getDocumentosRequeridos] Error:', error);
      throw error;
    }
  }

  async descargarArchivoRespuesta(sa_id: number) {
    const sql = `
      SELECT sa_nombre_original, sa_tipo_mime, sa_ruta_almacenamiento,
             sa_cloudinary_public_id, sa_resource_type
      FROM Solicitud_archivo
      WHERE sa_id = @0
    `;

    const archivo = await this.dataSource.query(sql, [sa_id]);

    if (!archivo || archivo.length === 0) {
      throw new Error('Archivo no encontrado');
    }

    const {
      sa_ruta_almacenamiento,
      sa_nombre_original,
      sa_cloudinary_public_id,
      sa_resource_type,
    } = archivo[0];

    const downloadUrl = sa_cloudinary_public_id
      ? this.storageService.buildDownloadUrl(
          sa_cloudinary_public_id,
          sa_resource_type,
          sa_nombre_original,
        )
      : sa_ruta_almacenamiento;

    return { downloadUrl, nombreOriginal: sa_nombre_original };
  }

  async deleteSolicitud(solicitudId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar que la solicitud exista
      const solicitudResult = await queryRunner.query(
        `SELECT sa_sol_id, numero_solicitud, estado_id FROM solicitudes WHERE sa_sol_id = @0`,
        [solicitudId],
      );

      if (!solicitudResult.length) {
        await queryRunner.release();
        const error = new Error('No encontrado');
        (error as any).statusCode = 404;
        throw error;
      }

      const solicitud = solicitudResult[0];
      if (Number(solicitud.estado_id) !== 5) {
        await queryRunner.release();
        const error = new Error(
          'Solo se pueden eliminar solicitudes en estado borrador',
        );
        (error as any).statusCode = 409;
        throw error;
      }

      // Eliminar respuestas de formulario
      await queryRunner.query(
        `DELETE FROM Formulario_respuesta WHERE fr_solicitud_id = @0`,
        [solicitudId],
      );

      // Eliminar la solicitud
      await queryRunner.query(`DELETE FROM solicitudes WHERE sa_sol_id = @0`, [
        solicitudId,
      ]);

      await queryRunner.commitTransaction();

      return {
        ok: true,
        sa_sol_id: solicitudId,
        numero_solicitud: solicitud.numero_solicitud,
        message: 'Solicitud eliminada correctamente',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
