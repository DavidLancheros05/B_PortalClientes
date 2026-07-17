// src/solicitudes/solicitudes-respuestas.service.ts
import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { TABLAS, COLUMNAS } from '../common/constants/tablas.constants';
import { SolicitudRespuestaDto } from './dto/solicitud-respuesta.response.dto';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../common/storage/storage.interface';

@Injectable()
export class SolicitudesRespuestasService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async obtenerRespuestas(
    solicitudId: number,
  ): Promise<SolicitudRespuestaDto[]> {
    const sql = `
      SELECT
        fr_id AS [fr_id],
        fr_solicitud_id AS [fr_solicitud_id],
        fr_fp_id AS [fr_fp_id],
        fr_valor_texto AS [fr_valor_texto],
        fr_valor_numero AS [fr_valor_numero],
        fr_valor_fecha AS [fr_valor_fecha],
        fr_valor_opcion_id AS [fr_valor_opcion_id],
        fr_valor_archivo_id AS [fr_valor_archivo_id],
        fr_es_multiselect AS [fr_es_multiselect],
        fr_completado AS [fr_completado],
        fr_observaciones AS [fr_observaciones],
        fr_created_at AS [fr_created_at],
        fr_actualizado_por AS [fr_actualizado_por],
        fr_updated_at AS [fr_updated_at],
        fr_valor_catalogo_tipo AS [fr_valor_catalogo_tipo],
        fr_valor_catalogo_id AS [fr_valor_catalogo_id]
      FROM Formulario_respuesta
      WHERE fr_solicitud_id = @0
      ORDER BY fr_fp_id
    `;

    return await this.dataSource.query(sql, [solicitudId]);
  }

  async guardarRespuesta(dto: any) {
    console.log('Guardando respuesta:', dto);

    const {
      sa_sol_id,
      fp_id,
      valor_texto,
      valor_numero,
      valor_fecha,
      valor_opcion_id,
      es_multiselect,
    } = dto;

    // Validar que los datos no sean undefined
    if (!sa_sol_id || !fp_id) {
      throw new Error('sa_sol_id y fp_id son obligatorios');
    }

    // Obtener el tipo de pregunta para determinar cómo guardar la respuesta
    const preguntaResult = await this.dataSource.query(
      `SELECT fp_tipo FROM Formulario_pregunta WHERE fp_id = @0`,
      [fp_id],
    );
    const fpTipo = preguntaResult?.[0]?.fp_tipo;
    console.log(`📋 Tipo de pregunta fp_id=${fp_id}: ${fpTipo}`);

    // Convertir undefined a null y validar tipos
    let valorTexto =
      valor_texto !== undefined
        ? valor_texto === ''
          ? null
          : valor_texto
        : null;
    const valorNumero =
      valor_numero !== undefined
        ? valor_numero === ''
          ? null
          : valor_numero
        : null;
    const valorFecha =
      valor_fecha !== undefined
        ? valor_fecha === ''
          ? null
          : valor_fecha
        : null;

    // Manejar valor_opcion_id como array o valor único
    const opcionesIds: (number | null)[] = [];
    const esSelectTabla = fpTipo === 'SELECT_TABLA';
    const esMultiselectTipo = fpTipo === 'MULTISELECT';

    if (
      valor_opcion_id !== undefined &&
      valor_opcion_id !== null &&
      valor_opcion_id !== ''
    ) {
      if (Array.isArray(valor_opcion_id)) {
        opcionesIds.push(
          ...valor_opcion_id.map((id) => (id === '' ? null : Number(id))),
        );
      } else {
        opcionesIds.push(Number(valor_opcion_id));
      }
    }

    // Validar que no haya conflicto entre valor_texto y opciones (solo para opciones regulares)
    if (!esSelectTabla && valorTexto && opcionesIds.length > 0) {
      console.warn(
        '⚠️ Conflicto: se proporcionaron ambos valor_texto y valor_opcion_id',
      );
      // Priorizar valor_opcion_id para opciones
      valorTexto = null;
    } else if (
      !esSelectTabla &&
      !valorTexto &&
      opcionesIds.length === 0 &&
      !valorNumero &&
      !valorFecha
    ) {
      console.warn('⚠️ Todos los valores están vacíos');
      throw new Error(
        'Debe proporcionar al menos un valor (texto, número, fecha u opción)',
      );
    }

    // Este método siempre hace INSERT (nunca UPDATE), así que sin este borrado
    // las respuestas se acumulan indefinidamente en cada guardado. Para MULTISELECT
    // (una fila por opción marcada) eso mezcla selecciones viejas con las nuevas al
    // recargar la solicitud, y para el resto deja historial contradictorio.
    // El borrado y la inserción van en una transacción: si el insert falla por
    // cualquier motivo, se revierte el borrado y no se pierde la respuesta anterior.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `DELETE FROM Formulario_respuesta WHERE fr_solicitud_id = @0 AND fr_fp_id = @1`,
        [sa_sol_id, fp_id],
      );

      // Para SELECT_TABLA, guardar el ID en valor_numero (no tiene opciones predefinidas)
      if (esSelectTabla && opcionesIds.length > 0) {
        console.log(
          `ℹ️ Pregunta tipo SELECT_TABLA detectada. Guardando ID en valor_numero`,
        );
        // SELECT_TABLA usa IDs de tablas catálogo (país, departamento, ciudad)
        const sql = `
          INSERT INTO Formulario_respuesta
          (fr_solicitud_id, fr_fp_id, fr_valor_numero, fr_es_multiselect, fr_created_at)
          VALUES (@0, @1, @2, @3, GETDATE())
        `;

        for (const opcionId of opcionesIds) {
          const params = [
            sa_sol_id,
            fp_id,
            opcionId,
            esMultiselectTipo ? 1 : 0,
          ];
          console.log('🔹 SQL Params (SELECT_TABLA):', params);
          await queryRunner.query(sql, params);
        }
      } else if (opcionesIds.length > 0) {
        // Si hay opciones (SELECT regular, no SELECT_TABLA), insertar un registro por cada opción
        const sql = `
          INSERT INTO Formulario_respuesta
          (fr_solicitud_id, fr_fp_id, fr_valor_opcion_id, fr_es_multiselect, fr_created_at)
          VALUES (@0, @1, @2, @3, GETDATE())
        `;

        for (const opcionId of opcionesIds) {
          const params = [
            sa_sol_id,
            fp_id,
            opcionId,
            // es_multiselect refleja el tipo de la pregunta, no cuantas
            // opciones quedaron marcadas -- antes una sola opcion marcada en
            // una pregunta MULTISELECT se guardaba con es_multiselect=0,
            // indistinguible de un SELECT normal al recargar la solicitud.
            esMultiselectTipo ? 1 : 0,
          ];
          console.log('🔹 SQL Params (opción):', params);
          await queryRunner.query(sql, params);
        }
      } else {
        // Insertar registro único para valor_texto, numero, o fecha
        const sql = `
          INSERT INTO Formulario_respuesta
          (fr_solicitud_id, fr_fp_id, fr_valor_texto, fr_valor_numero, fr_valor_fecha, fr_created_at)
          VALUES (@0, @1, @2, @3, @4, GETDATE())
        `;

        const params = [sa_sol_id, fp_id, valorTexto, valorNumero, valorFecha];

        console.log('🔹 SQL Params (valor):', params);
        await queryRunner.query(sql, params);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return {
      ok: true,
      mensaje: esSelectTabla
        ? 'Respuesta guardada (SELECT_TABLA)'
        : 'Respuesta guardada',
    };
  }

  async guardarRespuestaArchivo(dto: any, file?: any, usuarioId?: number) {
    console.log('🔵 [guardarRespuestaArchivo] Iniciando guardado:', {
      dto,
      usuarioId,
      archivo: file?.originalname,
    });

    if (!file) {
      throw new Error('No se proporcionó ningún archivo');
    }

    const { sa_sol_id, fp_id, fechaEmision } = dto;

    if (!sa_sol_id || !fp_id) {
      console.error('🔴 [guardarRespuestaArchivo] Parámetros faltantes:', {
        sa_sol_id,
        fp_id,
      });
      throw new Error('sa_sol_id y fp_id son obligatorios');
    }

    const preguntaTipoResult = await this.dataSource.query(
      `SELECT fp_tipo FROM Formulario_pregunta WHERE fp_id = @0`,
      [fp_id],
    );
    const fpTipo = preguntaTipoResult?.[0]?.fp_tipo;
    if (fpTipo === 'IMAGEN' && !/^image\//.test(file.mimetype || '')) {
      throw new BadRequestException(
        'Esta pregunta solo admite archivos de imagen (jpg, png, etc.)',
      );
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');

    const nombreGuardado = `${Date.now()}_${checksum.substring(0, 8)}_${file.originalname}`;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Obtener datos de la solicitud (nit, número solicitud, centro operación)
      const solicitudSQL = `
        SELECT sol_nit_documento, sol_numero_solicitud, sol_co_id
        FROM solicitudes
        WHERE sol_id = @0
      `;
      const solicitudResult = await queryRunner.query(solicitudSQL, [
        sa_sol_id,
      ]);
      if (!solicitudResult || solicitudResult.length === 0) {
        throw new Error(`Solicitud con id ${sa_sol_id} no encontrada`);
      }

      const { sol_nit_documento, sol_numero_solicitud, sol_co_id } =
        solicitudResult[0];

      // Obtener nombre del centro de operación
      const centroSQL = `
        SELECT cop_nombre
        FROM Centro_operacion
        WHERE cop_id = @0
      `;
      const centroResult = await queryRunner.query(centroSQL, [sol_co_id]);
      if (!centroResult || centroResult.length === 0) {
        throw new Error(
          `Centro de operación con id ${sol_co_id} no encontrado`,
        );
      }

      const { cop_nombre } = centroResult[0];

      // Subir al almacenamiento configurado, espejando la estructura de
      // carpetas que se usaba en disco: documentos-solicitudes/{centro}/formularios/{numero_solicitud}
      const carpetaAlmacenamiento = `documentos-solicitudes/${cop_nombre}/formularios/${sol_numero_solicitud}`;
      const subida = await this.storageService.upload(file.buffer, {
        folder: carpetaAlmacenamiento,
        filename: nombreGuardado,
        mimetype: file.mimetype,
      });
      const rutaAlmacenamiento = subida.url;
      console.log(`☁️ Archivo subido al almacenamiento: ${rutaAlmacenamiento}`);

      // Si hay fechaEmision, calcular la fecha de vencimiento según el tipo
      // de documento antes de insertar, para guardarla en la misma fila.
      let fechaEmisionValue: string | null = null;
      let fechaVencimientoValue: string | null = null;

      if (fechaEmision) {
        const getPreguntaSQL = `
          SELECT fp_tipo_documento_id
          FROM Formulario_pregunta
          WHERE fp_id = @0
        `;
        const preguntaResult = await queryRunner.query(getPreguntaSQL, [fp_id]);
        const tdo_tipo_documento_id = preguntaResult?.[0]?.fp_tipo_documento_id;

        if (tdo_tipo_documento_id) {
          const getDocumentoSQL = `
            SELECT ${COLUMNAS.TIPOS_DOCUMENTOS.vigencia}
            FROM ${TABLAS.TIPOS_DOCUMENTOS}
            WHERE ${COLUMNAS.TIPOS_DOCUMENTOS.id} = @0
          `;
          const docResult = await queryRunner.query(getDocumentoSQL, [
            tdo_tipo_documento_id,
          ]);
          const tdo_vigencia_dias =
            docResult?.[0]?.[COLUMNAS.TIPOS_DOCUMENTOS.vigencia];

          fechaEmisionValue = fechaEmision;
          if (tdo_vigencia_dias) {
            const [year, month, day] = fechaEmision.split('-').map(Number);
            const fechaBase = new Date(year, month - 1, day);
            const fechaVencimiento = new Date(fechaBase);
            fechaVencimiento.setDate(
              fechaVencimiento.getDate() + tdo_vigencia_dias,
            );
            fechaVencimientoValue = fechaVencimiento
              .toISOString()
              .split('T')[0];
          }
        } else {
          console.warn(
            '⚠️  [guardarRespuestaArchivo] No se encontró fp_tipo_documento_id para fp_id:',
            fp_id,
          );
        }
      }

      const sqlArchivo = `
        INSERT INTO Solicitud_archivo
        (sa_sol_id, sa_fp_id, sa_nombre_original, sa_nombre_guardado, sa_tamaño_bytes, sa_tipo_mime, sa_ruta_almacenamiento, sa_cargado_por, sa_estado, sa_checksum_archivo, sa_cloudinary_public_id, sa_resource_type, sa_created_at, sa_fecha_emision, sa_fecha_vencimiento)
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, GETDATE(), @12, @13)
      `;

      const paramsArchivo = [
        sa_sol_id,
        fp_id,
        file.originalname,
        nombreGuardado,
        file.size || file.buffer?.length || 0,
        file.mimetype || 'application/octet-stream',
        rutaAlmacenamiento,
        usuarioId || 0,
        'activo',
        checksum,
        subida.providerId,
        subida.resourceType,
        fechaEmisionValue,
        fechaVencimientoValue,
      ];

      console.log('🔹 SQL Params (archivo):', paramsArchivo);
      console.log('🔹 Ejecutando INSERT en Solicitud_archivo...');
      const resultInsert = await queryRunner.query(sqlArchivo, paramsArchivo);
      console.log(
        '✅ [guardarRespuestaArchivo] INSERT completado:',
        resultInsert,
      );

      await queryRunner.commitTransaction();

      console.log(
        `✅ Archivo ${file.originalname} guardado para solicitud ${sa_sol_id}, pregunta ${fp_id}`,
      );

      return {
        ok: true,
        mensaje: 'Archivo guardado exitosamente',
        data: {
          sa_sol_id,
          fp_id,
          sa_nombre_original: file.originalname,
          sa_nombre_guardado: nombreGuardado,
          sa_tamaño_bytes: file.size || file.buffer?.length || 0,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error al guardar archivo:', error);
      throw new Error(
        `Error al guardar archivo: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async actualizarFechaDocumento(
    solicitudId: number,
    fpId: number,
    fechaEmision: string,
    usuarioId?: number,
  ) {
    console.log('📅 [actualizarFechaDocumento] Iniciando actualización:', {
      solicitudId,
      fpId,
      fechaEmision,
    });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Obtener tdo_tipo_documento_id de la pregunta
      const getPreguntaSQL = `
        SELECT fp_tipo_documento_id
        FROM Formulario_pregunta
        WHERE fp_id = @0
      `;
      const preguntaResult = await queryRunner.query(getPreguntaSQL, [fpId]);
      const tdo_tipo_documento_id = preguntaResult?.[0]?.fp_tipo_documento_id;

      if (!tdo_tipo_documento_id) {
        throw new Error(`No se encontró tipo de documento para fp_id ${fpId}`);
      }

      // 2. Obtener tdo_vigencia_dias
      const getDocumentoSQL = `
        SELECT ${COLUMNAS.TIPOS_DOCUMENTOS.vigencia}
        FROM ${TABLAS.TIPOS_DOCUMENTOS}
        WHERE ${COLUMNAS.TIPOS_DOCUMENTOS.id} = @0
      `;
      const docResult = await queryRunner.query(getDocumentoSQL, [
        tdo_tipo_documento_id,
      ]);
      const tdo_vigencia_dias =
        docResult?.[0]?.[COLUMNAS.TIPOS_DOCUMENTOS.vigencia];

      // 3. Calcular fecha de vencimiento
      let fechaVencimiento = null;
      if (tdo_vigencia_dias) {
        const [year, month, day] = fechaEmision.split('-').map(Number);
        const fechaBase = new Date(year, month - 1, day);
        fechaVencimiento = new Date(fechaBase);
        fechaVencimiento.setDate(
          fechaVencimiento.getDate() + tdo_vigencia_dias,
        );
      }

      // 4. Actualizar la fecha en Solicitud_archivo (por archivo, no por tipo)
      const updateSQL = `
        UPDATE Solicitud_archivo
        SET sa_fecha_emision = @0, sa_fecha_vencimiento = @1, sa_requiere_cambio = 0
        WHERE sa_sol_id = @2 AND sa_fp_id = @3 AND sa_estado = 'activo'
      `;

      console.log('✅ [actualizarFechaDocumento] Actualizando fecha:', {
        sa_fecha_emision: fechaEmision,
        sa_fecha_vencimiento: fechaVencimiento
          ? fechaVencimiento.toISOString().split('T')[0]
          : null,
      });

      await queryRunner.query(updateSQL, [
        fechaEmision,
        fechaVencimiento ? fechaVencimiento.toISOString().split('T')[0] : null,
        solicitudId,
        fpId,
      ]);

      await queryRunner.commitTransaction();

      return {
        ok: true,
        mensaje: 'Fecha de documento actualizada exitosamente',
        data: {
          sa_sol_id: solicitudId,
          fp_id: fpId,
          sd_fecha_emision: fechaEmision,
          sd_fecha_vencimiento: fechaVencimiento
            ? fechaVencimiento.toISOString().split('T')[0]
            : null,
        },
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('❌ Error al actualizar fecha:', error);
      throw new Error(
        `Error al actualizar fecha: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async obtenerRespuestaArchivo(solicitudId: number, saId: number) {
    console.log(`Obteniendo archivo: sa_sol_id=${solicitudId}, sa_id=${saId}`);

    const sql = `
      SELECT sa_id, sa_sol_id, sa_fp_id, sa_nombre_original, sa_nombre_guardado,
             sa_tamaño_bytes, sa_tipo_mime, sa_ruta_almacenamiento, sa_cargado_por,
             sa_estado, sa_created_at as fecha_carga, sa_cloudinary_public_id,
             sa_resource_type
      FROM Solicitud_archivo
      WHERE sa_id = @0 AND sa_sol_id = @1 AND sa_estado = 'activo'
    `;

    const result = await this.dataSource.query(sql, [saId, solicitudId]);

    if (!result || result.length === 0) {
      const error = new Error('Archivo no encontrado');
      (error as any).statusCode = 404;
      throw error;
    }

    const archivo = result[0];
    const downloadUrl = archivo.sa_cloudinary_public_id
      ? this.storageService.buildDownloadUrl(
          archivo.sa_cloudinary_public_id,
          archivo.sa_resource_type,
          archivo.sa_nombre_original,
          true, // inline: se abre en el navegador, no fuerza descarga
        )
      : archivo.sa_ruta_almacenamiento;

    return { ...archivo, downloadUrl };
  }

  async eliminarRespuestaArchivo(solicitudId: number, saId: number) {
    console.log(`Eliminando archivo: sa_sol_id=${solicitudId}, sa_id=${saId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el archivo existe y pertenece a la solicitud
      const archivoResult = await queryRunner.query(
        `SELECT sa_id, sa_nombre_guardado, sa_ruta_almacenamiento, sa_cloudinary_public_id, sa_resource_type
         FROM Solicitud_archivo
         WHERE sa_id = @0 AND sa_sol_id = @1`,
        [saId, solicitudId],
      );

      if (!archivoResult || archivoResult.length === 0) {
        const error = new Error('Archivo no encontrado');
        (error as any).statusCode = 404;
        throw error;
      }

      const archivo = archivoResult[0];

      // Marcar como inactivo en la base de datos
      const updateSql = `
        UPDATE Solicitud_archivo
        SET sa_estado = 'inactivo', sa_updated_at = GETDATE()
        WHERE sa_id = @0
      `;

      await queryRunner.query(updateSql, [saId]);
      await queryRunner.commitTransaction();

      // Intentar eliminar el archivo del almacenamiento (no fallar si no existe)
      if (archivo.sa_cloudinary_public_id) {
        await this.storageService.destroy(
          archivo.sa_cloudinary_public_id,
          archivo.sa_resource_type,
        );
      }

      console.log(`✅ Archivo ${saId} marcado como inactivo`);

      return {
        ok: true,
        mensaje: 'Archivo eliminado exitosamente',
        sa_id: saId,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
