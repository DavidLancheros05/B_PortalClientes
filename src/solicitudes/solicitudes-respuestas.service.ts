// src/solicitudes/solicitudes-respuestas.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { TABLAS, COLUMNAS } from '../common/constants/tablas.constants';
import { SolicitudRespuestaDto } from './dto/solicitud-respuesta.response.dto';

@Injectable()
export class SolicitudesRespuestasService {
  constructor(private readonly dataSource: DataSource) {}

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
      solicitud_id,
      fp_id,
      valor_texto,
      valor_numero,
      valor_fecha,
      valor_opcion_id,
      es_multiselect,
    } = dto;

    // Validar que los datos no sean undefined
    if (!solicitud_id || !fp_id) {
      throw new Error('solicitud_id y fp_id son obligatorios');
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
        [solicitud_id, fp_id],
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
            solicitud_id,
            fp_id,
            opcionId,
            opcionesIds.length > 1 ? 1 : 0,
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
            solicitud_id,
            fp_id,
            opcionId,
            opcionesIds.length > 1 ? 1 : 0, // es_multiselect = 1 si hay múltiples
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

        const params = [solicitud_id, fp_id, valorTexto, valorNumero, valorFecha];

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

    const { solicitud_id, fp_id, fechaEmision } = dto;

    if (!solicitud_id || !fp_id) {
      console.error('🔴 [guardarRespuestaArchivo] Parámetros faltantes:', {
        solicitud_id,
        fp_id,
      });
      throw new Error('solicitud_id y fp_id son obligatorios');
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
        solicitud_id,
      ]);
      if (!solicitudResult || solicitudResult.length === 0) {
        throw new Error(`Solicitud con id ${solicitud_id} no encontrada`);
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

      // Construir ruta: Documentos-Solicitudes/{centro}/formularios/{numero_solicitud}
      const uploadDir = join(
        process.cwd(),
        'Documentos-Solicitudes',
        cop_nombre,
        'formularios',
        sol_numero_solicitud,
      );
      const rutaAlmacenamiento = join(uploadDir, nombreGuardado);

      // Crear directorio si no existe
      await mkdir(uploadDir, { recursive: true });

      // Guardar archivo en disco
      await writeFile(rutaAlmacenamiento, file.buffer);
      console.log(`📁 Archivo guardado en disco: ${rutaAlmacenamiento}`);

      const sqlArchivo = `
        INSERT INTO Solicitud_archivo
        (solicitud_id, fp_id, nombre_original, nombre_guardado, tamaño_bytes, tipo_mime, ruta_almacenamiento, cargado_por, estado, checksum_archivo, created_at)
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, GETDATE())
      `;

      const paramsArchivo = [
        solicitud_id,
        fp_id,
        file.originalname,
        nombreGuardado,
        file.size || file.buffer?.length || 0,
        file.mimetype || 'application/octet-stream',
        rutaAlmacenamiento,
        usuarioId || 0,
        'activo',
        checksum,
      ];

      console.log('🔹 SQL Params (archivo):', paramsArchivo);
      console.log('🔹 Ejecutando INSERT en Solicitud_archivo...');
      const resultInsert = await queryRunner.query(sqlArchivo, paramsArchivo);
      console.log(
        '✅ [guardarRespuestaArchivo] INSERT completado:',
        resultInsert,
      );

      // Si hay fechaEmision, guardar metadatos en Solicitud_documento
      if (fechaEmision) {
        console.log(
          '📅 [guardarRespuestaArchivo] Guardando fecha de emisión:',
          fechaEmision,
        );
        // 1. Obtener tdo_tipo_documento_id y tdo_vigencia_dias de la pregunta
        const getPreguntaSQL = `
          SELECT fp_tipo_documento_id
          FROM Formulario_pregunta
          WHERE fp_id = @0
        `;
        const preguntaResult = await queryRunner.query(getPreguntaSQL, [fp_id]);
        const tdo_tipo_documento_id = preguntaResult?.[0]?.fp_tipo_documento_id;
        console.log(
          '📋 fp_tipo_documento_id encontrado:',
          tdo_tipo_documento_id,
        );

        if (tdo_tipo_documento_id) {
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
          console.log('📋 tdo_vigencia_dias encontrado:', tdo_vigencia_dias);

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
          console.log(
            '📋 fechaVencimiento calculada:',
            fechaVencimiento?.toISOString().split('T')[0] || null,
          );

          // 4. Eliminar documento existente para este tipo (mantener solo el actual)
          const deleteSQL = `
            DELETE FROM Solicitud_documento
            WHERE sd_solicitud_id = @0 AND sd_tipo_documento_id = @1
          `;
          console.log('🗑️  Eliminando documento anterior:', {
            solicitud_id,
            tdo_tipo_documento_id,
          });
          await queryRunner.query(deleteSQL, [
            solicitud_id,
            tdo_tipo_documento_id,
          ]);

          // 5. Insertar nuevo documento con metadatos
          const insertDocSQL = `
            INSERT INTO Solicitud_documento
            (sd_solicitud_id, sd_tipo_documento_id, sd_ruta_archivo, sd_fecha_emision, sd_fecha_vencimiento, sd_usuario, sd_estado, sd_created_at)
            VALUES (@0, @1, @2, @3, @4, @5, 1, GETDATE())
          `;
          const paramsDoc = [
            solicitud_id,
            tdo_tipo_documento_id,
            rutaAlmacenamiento,
            fechaEmision,
            fechaVencimiento
              ? fechaVencimiento.toISOString().split('T')[0]
              : null,
            usuarioId || 0,
          ];
          console.log(
            '✅ [guardarRespuestaArchivo] Insertando documento con metadatos:',
            {
              solicitud_id,
              tdo_tipo_documento_id,
              sd_fecha_emision: fechaEmision,
              sd_fecha_vencimiento: fechaVencimiento
                ? fechaVencimiento.toISOString().split('T')[0]
                : null,
            },
          );
          await queryRunner.query(insertDocSQL, paramsDoc);
        } else {
          console.warn(
            '⚠️  [guardarRespuestaArchivo] No se encontró fp_tipo_documento_id para fp_id:',
            fp_id,
          );
        }
      } else {
        console.warn(
          '⚠️  [guardarRespuestaArchivo] NO hay fechaEmision, no se guardarán metadatos del documento',
        );
      }

      await queryRunner.commitTransaction();

      console.log(
        `✅ Archivo ${file.originalname} guardado para solicitud ${solicitud_id}, pregunta ${fp_id}`,
      );

      return {
        ok: true,
        mensaje: 'Archivo guardado exitosamente',
        data: {
          solicitud_id,
          fp_id,
          nombre_original: file.originalname,
          nombre_guardado: nombreGuardado,
          tamaño_bytes: file.size || file.buffer?.length || 0,
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

      // 4. Actualizar la fecha en Solicitud_documento
      const updateSQL = `
        UPDATE Solicitud_documento
        SET sd_fecha_emision = @0, sd_fecha_vencimiento = @1, sd_usuario = @2
        WHERE sd_solicitud_id = @3 AND sd_tipo_documento_id = @4
      `;

      console.log('✅ [actualizarFechaDocumento] Actualizando fecha:', {
        sd_fecha_emision: fechaEmision,
        sd_fecha_vencimiento: fechaVencimiento
          ? fechaVencimiento.toISOString().split('T')[0]
          : null,
        sd_usuario: usuarioId,
      });

      await queryRunner.query(updateSQL, [
        fechaEmision,
        fechaVencimiento ? fechaVencimiento.toISOString().split('T')[0] : null,
        usuarioId || 0,
        solicitudId,
        tdo_tipo_documento_id,
      ]);

      await queryRunner.commitTransaction();

      return {
        ok: true,
        mensaje: 'Fecha de documento actualizada exitosamente',
        data: {
          solicitud_id: solicitudId,
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
    console.log(
      `Obteniendo archivo: solicitud_id=${solicitudId}, sa_id=${saId}`,
    );

    const sql = `
      SELECT sa_id, solicitud_id, fp_id, nombre_original, nombre_guardado,
             tamaño_bytes, tipo_mime, ruta_almacenamiento, cargado_por,
             estado, created_at as fecha_carga
      FROM Solicitud_archivo
      WHERE sa_id = @0 AND solicitud_id = @1 AND estado = 'activo'
    `;

    const result = await this.dataSource.query(sql, [saId, solicitudId]);

    if (!result || result.length === 0) {
      const error = new Error('Archivo no encontrado');
      (error as any).statusCode = 404;
      throw error;
    }

    const archivo = result[0];

    try {
      // Leer archivo del disco
      const buffer = await readFile(archivo.ruta_almacenamiento);
      console.log(`✅ Archivo leído del disco: ${archivo.ruta_almacenamiento}`);

      return {
        ...archivo,
        buffer,
      };
    } catch (error) {
      console.error('❌ Error al leer archivo del disco:', error);
      throw new Error(
        `Error al leer archivo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async eliminarRespuestaArchivo(solicitudId: number, saId: number) {
    console.log(
      `Eliminando archivo: solicitud_id=${solicitudId}, sa_id=${saId}`,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el archivo existe y pertenece a la solicitud
      const archivoResult = await queryRunner.query(
        `SELECT sa_id, nombre_guardado, ruta_almacenamiento FROM Solicitud_archivo
         WHERE sa_id = @0 AND solicitud_id = @1`,
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
        SET estado = 'inactivo', updated_at = GETDATE()
        WHERE sa_id = @0
      `;

      await queryRunner.query(updateSql, [saId]);
      await queryRunner.commitTransaction();

      // Intentar eliminar el archivo del disco (no fallar si no existe)
      try {
        await unlink(archivo.ruta_almacenamiento);
        console.log(
          `📁 Archivo eliminado del disco: ${archivo.ruta_almacenamiento}`,
        );
      } catch (diskError) {
        console.warn(
          `⚠️ No se pudo eliminar el archivo del disco: ${diskError}`,
        );
        // No fallar si el archivo del disco no existe
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
