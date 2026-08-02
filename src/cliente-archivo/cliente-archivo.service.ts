// src/cliente-archivo/cliente-archivo.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IStorageService, STORAGE_SERVICE } from '../common/storage/storage.interface';

/**
 * Archivo "definitivo" del cliente (Cliente_archivo): un único documento
 * vigente por (cliente, tipo de documento), reutilizable entre solicitudes
 * futuras. Ver
 * documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md.
 */
@Injectable()
export class ClienteArchivoService {
  private readonly logger = new Logger(ClienteArchivoService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  /**
   * Promueve los documentos activos de una solicitud (los que no quedaron
   * marcados sa_requiere_cambio) hacia el archivo del cliente, por upsert
   * en (cli_id, tdo_id). Se llama dentro de la misma transacción de
   * aprobación en CC2 (mismo queryRunner) — si algo falla, se revierte
   * junto con el resto de la aprobación.
   */
  async promoverDocumentos(
    clienteId: number,
    solicitudId: number,
    queryRunner: any,
  ): Promise<void> {
    const documentos = await queryRunner.query(
      `SELECT sa.sa_id, sa.sa_nombre_original, sa.sa_ruta_almacenamiento,
              sa.sa_tipo_mime, sa.sa_resource_type, sa.sa_fecha_emision, sa.sa_fecha_vencimiento,
              fp.fp_tipo_documento_id AS tdo_id
       FROM Solicitud_archivo sa
       JOIN Formulario_pregunta fp ON fp.fp_id = sa.sa_fp_id
       WHERE sa.sa_sol_id = @0
         AND sa.sa_estado = 'activo'
         AND ISNULL(sa.sa_requiere_cambio, 0) = 0
         AND fp.fp_tipo_documento_id IS NOT NULL`,
      [solicitudId],
    );

    let promovidos = 0;

    for (const doc of documentos) {
      // Duplicado real en Cloudinary (no solo copiar la URL): el archivo
      // "definitivo" del cliente debe ser un asset propio e independiente,
      // para que reemplazar/eliminar el original en la solicitud aprobada
      // (storageService.destroy()) no rompa el archivo consolidado del
      // cliente ni ninguna Ampliación de Cupo que lo haya clonado desde acá.
      let duplicado;
      try {
        duplicado = await this.storageService.duplicate(
          doc.sa_ruta_almacenamiento,
          {
            folder: `documentos-cliente/${clienteId}/${doc.tdo_id}`,
            filename: doc.sa_nombre_original,
            resourceType: doc.sa_resource_type || 'raw',
          },
        );
      } catch (error) {
        this.logger.error(
          `[promoverDocumentos] No se pudo duplicar el documento tdo_id=${doc.tdo_id} (sa_id=${doc.sa_id}) — se omite, el original en Solicitud_archivo sigue siendo la fuente de verdad:`,
          error,
        );
        continue;
      }

      const [existente] = await queryRunner.query(
        `SELECT ca_id FROM Cliente_archivo WHERE ca_cli_id = @0 AND ca_tdo_id = @1`,
        [clienteId, doc.tdo_id],
      );

      const params = [
        doc.sa_id,
        doc.sa_nombre_original,
        duplicado.url,
        doc.sa_tipo_mime,
        doc.sa_fecha_emision,
        doc.sa_fecha_vencimiento,
        duplicado.providerId,
        duplicado.resourceType,
      ];

      if (existente) {
        await queryRunner.query(
          `UPDATE Cliente_archivo SET
             ca_sa_id = @0, ca_nombre_original = @1, ca_ruta_almacenamiento = @2,
             ca_tipo_mime = @3, ca_fecha_emision = @4, ca_fecha_vencimiento = @5,
             ca_cloudinary_public_id = @6, ca_resource_type = @7,
             ca_created_at = GETDATE()
           WHERE ca_cli_id = @8 AND ca_tdo_id = @9`,
          [...params, clienteId, doc.tdo_id],
        );
      } else {
        await queryRunner.query(
          `INSERT INTO Cliente_archivo
             (ca_cli_id, ca_tdo_id, ca_sa_id, ca_nombre_original, ca_ruta_almacenamiento,
              ca_tipo_mime, ca_fecha_emision, ca_fecha_vencimiento,
              ca_cloudinary_public_id, ca_resource_type)
           VALUES (@8, @9, @0, @1, @2, @3, @4, @5, @6, @7)`,
          [...params, clienteId, doc.tdo_id],
        );
      }

      promovidos++;
    }

    this.logger.log(
      `[promoverDocumentos] Cliente ${clienteId}: ${promovidos}/${documentos.length} documento(s) promovidos (duplicados) desde solicitud ${solicitudId}`,
    );
  }

  /** Lista lo que el cliente tiene vigente en su archivo, para ofrecerlo al iniciar una solicitud nueva. */
  async obtenerArchivoCliente(clienteId: number) {
    return this.dataSource.query(
      `SELECT ca.ca_id, ca.ca_tdo_id, td.tdo_nombre, ca.ca_nombre_original,
              ca.ca_ruta_almacenamiento, ca.ca_tipo_mime, ca.ca_fecha_emision,
              ca.ca_fecha_vencimiento, ca.ca_created_at
       FROM Cliente_archivo ca
       JOIN Tipos_documentos td ON td.tdo_id = ca.ca_tdo_id
       WHERE ca.ca_cli_id = @0
       ORDER BY td.tdo_nombre ASC`,
      [clienteId],
    );
  }

  /**
   * ¿Tiene el cliente documentos vencidos en su archivo consolidado? Un
   * cliente sin ninguna fila en Cliente_archivo (nunca se le promovió nada
   * — ej. aprobado antes de que existiera esta tabla y sin backfill) se
   * trata como "vencido" a propósito: es más conservador pedir de nuevo que
   * asumir que está todo vigente por falta de datos.
   */
  async tieneDocumentosVencidos(clienteId: number): Promise<boolean> {
    const filas = await this.dataSource.query(
      `SELECT ca_fecha_vencimiento FROM Cliente_archivo WHERE ca_cli_id = @0`,
      [clienteId],
    );

    if (!filas || filas.length === 0) return true;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return filas.some(
      (f: any) =>
        f.ca_fecha_vencimiento && new Date(f.ca_fecha_vencimiento) < hoy,
    );
  }
}
