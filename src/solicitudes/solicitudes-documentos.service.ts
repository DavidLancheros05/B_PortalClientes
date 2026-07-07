// src/solicitudes/solicitudes-documentos.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TABLAS, COLUMNAS } from '../common/constants/tablas.constants';

@Injectable()
export class SolicitudesDocumentosService {
  constructor(private readonly dataSource: DataSource) {}

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
    console.log(`Obteniendo archivos existentes: solicitud_id=${solicitudId}`);

    const sql = `
      SELECT sa.sa_id, sa.solicitud_id, sa.fp_id, sa.nombre_original, sa.nombre_guardado,
             sa.tamaño_bytes, sa.tipo_mime, sa.ruta_almacenamiento, sa.cargado_por,
             sa.estado, sa.created_at as fecha_carga,
             sd.sd_fecha_emision, sd.sd_fecha_vencimiento
      FROM Solicitud_archivo sa
      LEFT JOIN Solicitud_documento sd ON sa.solicitud_id = sd.sd_solicitud_id
             AND (SELECT fp_tipo_documento_id FROM Formulario_pregunta WHERE fp_id = sa.fp_id) = sd.sd_tipo_documento_id
      WHERE sa.solicitud_id = @0 AND sa.estado = 'activo'
      ORDER BY sa.created_at DESC
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
        sa.solicitud_id,
        s.sol_numero_solicitud,
        s.sol_estado_id,
        ses.ses_nombre AS estado_solicitud,
        td.tdo_nombre AS documento_nombre,
        sa.nombre_original,
        sa.tipo_mime,
        sa.tamaño_bytes,
        sa.ruta_almacenamiento,
        sa.created_at AS fecha_carga,
        sd.sd_fecha_vencimiento AS fecha_vencimiento,
        CASE
          WHEN sd.sd_fecha_vencimiento IS NOT NULL AND CAST(sd.sd_fecha_vencimiento AS DATE) < CAST(GETDATE() AS DATE) THEN 'VENCIDO'
          ELSE 'VIGENTE'
        END AS estado_vencimiento,
        c.cli_razon_social AS cliente_nombre,
        co.cop_nombre AS centro_operacion_nombre
      FROM Solicitud_archivo sa
      INNER JOIN solicitudes s ON sa.solicitud_id = s.sol_id
      INNER JOIN solicitud_estados ses ON s.sol_estado_id = ses.ses_id
      LEFT JOIN Solicitud_documento sd ON sa.solicitud_id = sd.sd_solicitud_id
      LEFT JOIN Tipos_documentos td ON sd.sd_tipo_documento_id = td.tdo_id
      INNER JOIN Clientes c ON s.sol_cliente_id = c.cli_id
      INNER JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
      WHERE sa.estado = 'activo'
      ORDER BY sa.created_at DESC
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

  async getDocumentosDeSolicitud(solicitudId: number) {
    const sql = `
      SELECT
        sd.sd_id AS id,
        sd.sd_solicitud_id AS solicitud_id,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.id} AS tipo_documento_id,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.nombre} AS nombre,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.descripcion} AS descripcion,
        td.${COLUMNAS.TIPOS_DOCUMENTOS.obligatorio} AS obligatorio,
        sd.sd_ruta_archivo AS ruta_archivo,
        sd.sd_fecha_emision AS fecha_emision,
        sd.sd_fecha_vencimiento AS fecha_vencimiento,
        sd.sd_estado AS estado
      FROM Solicitud_documento sd
      INNER JOIN ${TABLAS.TIPOS_DOCUMENTOS} td ON sd.sd_tipo_documento_id = td.${COLUMNAS.TIPOS_DOCUMENTOS.id}
      WHERE sd.sd_solicitud_id = @0 AND sd.sd_estado = 1
      ORDER BY td.${COLUMNAS.TIPOS_DOCUMENTOS.nombre} ASC
    `;

    try {
      const documentos = await this.dataSource.query(sql, [solicitudId]);
      return documentos;
    } catch (error) {
      console.error('[getDocumentosDeSolicitud] Error:', error);
      throw error;
    }
  }

  async descargarArchivoRespuesta(sa_id: number) {
    const sql = `
      SELECT nombre_original, tipo_mime, ruta_almacenamiento
      FROM Solicitud_archivo
      WHERE sa_id = @0
    `;

    const archivo = await this.dataSource.query(sql, [sa_id]);

    if (!archivo || archivo.length === 0) {
      throw new Error('Archivo no encontrado');
    }

    const { ruta_almacenamiento, nombre_original, tipo_mime } = archivo[0];

    try {
      const { readFile } = await import('fs/promises');
      const buffer = await readFile(ruta_almacenamiento);
      return { buffer, nombreOriginal: nombre_original, tipo_mime };
    } catch (error) {
      console.error('Error leyendo archivo:', error);
      throw new Error(`No se pudo leer el archivo: ${nombre_original}`);
    }
  }

  async deleteSolicitud(solicitudId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validar que la solicitud exista
      const solicitudResult = await queryRunner.query(
        `SELECT solicitud_id, numero_solicitud, estado_id FROM solicitudes WHERE solicitud_id = @0`,
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
      await queryRunner.query(
        `DELETE FROM solicitudes WHERE solicitud_id = @0`,
        [solicitudId],
      );

      await queryRunner.commitTransaction();

      return {
        ok: true,
        solicitud_id: solicitudId,
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
