import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';
import { contarSolicitudesQueBloqueanVersion } from './version-formulario.util';

export interface Formulario {
  frm_id: number;
  frm_nombre: string;
  frm_descripcion: string | null;
  frm_activo: boolean;
  formulario_version: number;
  Formulario_versiones_totales: number;
  created_at: string;
}

@Injectable()
export class FormulariosService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(
    busqueda?: string,
    estado?: 'ACTIVO' | 'INACTIVO' | 'TODOS',
  ): Promise<Formulario[]> {
    let query = `
      SELECT
        f.frm_id,
        f.frm_nombre,
        f.frm_descripcion,
        f.frm_activo,
        f.created_at,
        ISNULL(f.frm_version_activa, ISNULL((SELECT MAX(v.fv_numero) FROM Formulario_versiones v WHERE v.fv_frm_id = f.frm_id), 1)) AS formulario_version,
        ISNULL((SELECT COUNT(*) FROM Formulario_versiones v WHERE v.fv_frm_id = f.frm_id), 0) AS Formulario_versiones_totales
      FROM formularios f
      WHERE 1=1
    `;

    if (busqueda && busqueda.trim()) {
      const escapedBusqueda = busqueda.replace(/'/g, "''");
      query += ` AND (
        f.frm_nombre LIKE '%${escapedBusqueda}%'
        OR f.frm_descripcion LIKE '%${escapedBusqueda}%'
      )`;
    }

    if (estado === 'ACTIVO') {
      query += ` AND f.frm_activo = 1`;
    } else if (estado === 'INACTIVO') {
      query += ` AND f.frm_activo = 0`;
    }

    query += ` ORDER BY f.frm_id DESC`;

    const result = await this.dataSource.query(query);
    return result;
  }

  async obtenerPorId(formularioId: number): Promise<Formulario | null> {
    const result = await this.dataSource.query(
      `
      SELECT
        f.frm_id,
        f.frm_nombre,
        f.frm_descripcion,
        f.frm_activo,
        f.created_at,
        ISNULL(f.frm_version_activa, ISNULL((SELECT MAX(v.fv_numero) FROM Formulario_versiones v WHERE v.fv_frm_id = f.frm_id), 1)) AS formulario_version,
        ISNULL((SELECT COUNT(*) FROM Formulario_versiones v WHERE v.fv_frm_id = f.frm_id), 0) AS Formulario_versiones_totales
      FROM formularios f
      WHERE f.frm_id = @0
    `,
      [formularioId],
    );

    return result[0] || null;
  }

  async obtenerActivo() {
    const result = await this.dataSource.query(`
      SELECT TOP 1
        f.frm_id,
        f.frm_nombre,
        f.frm_descripcion,
        ISNULL(f.frm_version_activa, ISNULL((SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frm_id = f.frm_id), 1)) AS formulario_version
      FROM formularios f
      WHERE f.frm_activo = 1
      ORDER BY f.frm_id
    `);

    return result[0] || null;
  }

  async crear(nombre: string, descripcion?: string): Promise<Formulario> {
    const insertResult = await this.dataSource.query(
      `
      INSERT INTO formularios (
        frm_nombre,
        frm_descripcion,
        frm_activo,
        created_at,
        updated_at
      )
      OUTPUT
        INSERTED.frm_id,
        INSERTED.frm_nombre,
        INSERTED.frm_descripcion,
        INSERTED.frm_activo,
        INSERTED.created_at
      VALUES (
        @0,
        @1,
        1,
        SYSDATETIME(),
        SYSDATETIME()
      )
    `,
      [nombre, descripcion || null],
    );

    const nuevoFormulario = insertResult[0];

    await this.dataSource.query(
      `
      INSERT INTO Formulario_versiones (
        fv_frm_id,
        fv_numero,
        fv_cambios,
        fv_descripcion,
        fv_fecha_cambio,
        fv_created_at
      )
      VALUES (
        @0,
        1,
        'Versión inicial',
        'Versión inicial',
        SYSDATETIME(),
        SYSDATETIME()
      )
    `,
      [nuevoFormulario.frm_id],
    );

    return {
      ...nuevoFormulario,
      formulario_version: 1,
      Formulario_versiones_totales: 1,
    };
  }

  async eliminar(formularioId: number): Promise<boolean> {
    const existe = await this.dataSource.query(
      `SELECT frm_id, frm_activo FROM formularios WHERE frm_id = @0`,
      [formularioId],
    );

    if (existe.length === 0) {
      return false;
    }

    if (existe[0].frm_activo) {
      throw new Error(
        'No se puede eliminar el formulario activo. Actívalo desde otro formulario primero.',
      );
    }

    const usedInSolicitudes = await this.dataSource.query(
      `
      SELECT COUNT(*) AS total
      FROM solicitudes
      WHERE sol_formulario_version IN (
        SELECT fv_numero FROM Formulario_versiones WHERE fv_frm_id = @0
      )
      `,
      [formularioId],
    );

    if (usedInSolicitudes[0].total > 0) {
      throw new Error(
        'No se puede eliminar el formulario porque ya tiene solicitudes asociadas a alguna de sus versiones.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `
        DELETE FROM Formulario_pregunta_opcion
        WHERE fpo_fp_id IN (
          SELECT fp_id
          FROM Formulario_pregunta
          WHERE formulario_id = @0
        )
      `,
        [formularioId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_pregunta WHERE formulario_id = @0`,
        [formularioId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_versiones WHERE fv_frm_id = @0`,
        [formularioId],
      );

      await queryRunner.query(`DELETE FROM formularios WHERE frm_id = @0`, [
        formularioId,
      ]);

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async obtenerVersiones(formularioId: number) {
    const formulario = await this.dataSource.query(
      `
      SELECT
        frm_id,
        frm_nombre,
        frm_activo,
        ISNULL(frm_version_activa, ISNULL((SELECT MAX(fv_numero) FROM Formulario_versiones WHERE fv_frm_id = @0), 1)) AS formulario_version
      FROM formularios
      WHERE frm_id = @0
    `,
      [formularioId],
    );

    if (formulario.length === 0) {
      return null;
    }

    const versiones = await this.dataSource.query(
      `
      SELECT
        fv_id,
        fv_numero,
        ISNULL(fv_descripcion, fv_cambios) AS version_descripcion,
        ISNULL(fv_created_at, fv_fecha_cambio) AS created_at,
        ISNULL(fv_created_by, fv_usr_id_cambio) AS created_by,
        (SELECT COUNT(*) FROM Formulario_pregunta WHERE formulario_id = @0 AND ISNULL(fp_version, 1) = fv_numero) AS total_preguntas,
        -- Necesita este conteo por CADA versión a la vez, así que va inline
        -- como subquery correlacionada en vez de llamar a
        -- contarSolicitudesQueBloqueanVersion() (./version-formulario.util)
        -- en un loop. La condición (sol_estado_id <> 1, un borrador no
        -- cuenta) debe mantenerse igual a la de ese util — es la misma
        -- regla de negocio, ver el comentario ahí para el porqué.
        (SELECT COUNT(*) FROM solicitudes WHERE sol_formulario_version = fv_numero AND sol_estado_id <> 1) AS total_solicitudes
      FROM Formulario_versiones
      WHERE fv_frm_id = @0
      ORDER BY fv_numero DESC
    `,
      [formularioId],
    );

    return {
      formulario: formulario[0],
      versiones,
    };
  }

  async activarVersion(formularioId: number, versionNumero: number) {
    // "formulario_version" no es una columna real — nunca lo fue. Esto
    // nunca actualizaba nada (fallaba con "Invalid column name") y por eso
    // "versión activa" en toda la app siempre terminaba siendo, sin que
    // nadie lo pudiera cambiar, la más reciente creada. La columna real es
    // frm_version_activa (migración 20260718_agregar_frm_version_activa).
    const existe = await this.dataSource.query(
      `SELECT 1 AS existe FROM Formulario_versiones WHERE fv_frm_id = @0 AND fv_numero = @1`,
      [formularioId, versionNumero],
    );
    if (existe.length === 0) {
      throw new Error(
        `La versión ${versionNumero} no existe para este formulario`,
      );
    }

    await this.dataSource.query(
      `
      UPDATE formularios
      SET frm_version_activa = @1
      WHERE frm_id = @0
    `,
      [formularioId, versionNumero],
    );

    return {
      success: true,
      message: `Versión ${versionNumero} activada exitosamente`,
    };
  }

  async eliminarVersion(formularioId: number, versionNumero: number) {
    // "versión activa" = la fijada a mano con activarVersion
    // (frm_version_activa), o si nadie la fijó, la más reciente creada —
    // mismo criterio que obtenerActivo/listar/obtenerVersiones.
    const formulario = await this.dataSource.query(
      `
      SELECT
        frm_id,
        ISNULL(frm_version_activa, ISNULL((SELECT MAX(fv_numero) FROM Formulario_versiones WHERE fv_frm_id = frm_id), 1)) AS formulario_version
      FROM formularios
      WHERE frm_id = @0
      `,
      [formularioId],
    );

    if (formulario.length === 0) {
      throw new Error('Formulario no encontrado');
    }

    if (formulario[0].formulario_version === versionNumero) {
      throw new Error('No se puede eliminar la versión activa');
    }

    const usedInSolicitudes = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM solicitudes WHERE sol_formulario_version = @0`,
      [versionNumero],
    );

    if (usedInSolicitudes[0].total > 0) {
      throw new Error(
        'No se puede eliminar la versión porque ya está asociada a solicitudes existentes',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `
        DELETE FROM Formulario_pregunta_opcion
        WHERE fpo_fp_id IN (
          SELECT fp_id
          FROM Formulario_pregunta
          WHERE formulario_id = @0 AND ISNULL(fp_version, 1) = @1
        )
      `,
        [formularioId, versionNumero],
      );

      await queryRunner.query(
        `
        DELETE FROM Formulario_pregunta
        WHERE formulario_id = @0 AND ISNULL(fp_version, 1) = @1
      `,
        [formularioId, versionNumero],
      );

      await queryRunner.query(
        `
        DELETE FROM Formulario_versiones
        WHERE fv_frm_id = @0 AND fv_numero = @1
      `,
        [formularioId, versionNumero],
      );

      await queryRunner.commitTransaction();
      return {
        success: true,
        message: `Versión ${versionNumero} eliminada exitosamente`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async resolveVersionColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('Formulario_versiones','fv_descripcion') IS NOT NULL THEN 1 ELSE 0 END AS has_fv_descripcion,
        CASE WHEN COL_LENGTH('Formulario_versiones','fv_cambios') IS NOT NULL THEN 1 ELSE 0 END AS has_fv_cambios,
        CASE WHEN COL_LENGTH('Formulario_versiones','fv_created_at') IS NOT NULL THEN 1 ELSE 0 END AS has_fv_created_at,
        CASE WHEN COL_LENGTH('Formulario_versiones','fv_fecha_cambio') IS NOT NULL THEN 1 ELSE 0 END AS has_fv_fecha_cambio,
        CASE WHEN COL_LENGTH('Formulario_versiones','fv_created_by') IS NOT NULL THEN 1 ELSE 0 END AS has_fv_created_by,
        CASE WHEN COL_LENGTH('Formulario_versiones','fv_usr_id_cambio') IS NOT NULL THEN 1 ELSE 0 END AS has_fv_usr_id_cambio
    `);

    const row = result[0] || {};

    return {
      descripcion:
        Number(row.has_fv_descripcion) === 1
          ? 'fv_descripcion'
          : Number(row.has_fv_cambios) === 1
            ? 'fv_cambios'
            : null,
      fecha:
        Number(row.has_fv_created_at) === 1
          ? 'fv_created_at'
          : Number(row.has_fv_fecha_cambio) === 1
            ? 'fv_fecha_cambio'
            : null,
      usuario:
        Number(row.has_fv_created_by) === 1
          ? 'fv_created_by'
          : Number(row.has_fv_usr_id_cambio) === 1
            ? 'fv_usr_id_cambio'
            : null,
    };
  }

  async crearNuevaVersion(
    formularioId: number,
    data: {
      descripcion?: string;
      copiarDeVersion?: number;
      usuarioId?: number;
    },
  ) {
    if (!Number.isFinite(formularioId) || formularioId <= 0) {
      throw new Error('formularioId inválido');
    }

    const versionColumns = await this.resolveVersionColumns();

    const maxVersionResult = await this.dataSource.query(
      `
        SELECT ISNULL(MAX(fv_numero), 0) as max_version
        FROM Formulario_versiones
        WHERE fv_frm_id = @0
      `,
      [formularioId],
    );

    const nuevoNumeroVersion = maxVersionResult[0].max_version + 1;

    const insertColumns = ['fv_frm_id', 'fv_numero'];
    const insertValues = ['@0', '@1'];
    const params: any[] = [formularioId, nuevoNumeroVersion];

    if (versionColumns.descripcion) {
      insertColumns.push(versionColumns.descripcion);
      insertValues.push('@2');
      params.push(String(data.descripcion || '').trim() || null);
    }

    if (versionColumns.fecha) {
      insertColumns.push(versionColumns.fecha);
      insertValues.push('SYSDATETIME()');
    }

    if (versionColumns.usuario) {
      insertColumns.push(versionColumns.usuario);
      const paramIndex = params.length;
      insertValues.push(`@${paramIndex}`);
      params.push(Number(data.usuarioId) || 1);
    }

    const insertSql = `
      INSERT INTO Formulario_versiones (
        ${insertColumns.join(', ')}
      )
      OUTPUT INSERTED.fv_id
      VALUES (
        ${insertValues.join(', ')}
      )
    `;

    const insertResult = await this.dataSource.query(insertSql, params);
    const versionId = insertResult[0]?.fv_id;

    if (data.copiarDeVersion) {
      await this.copiarPreguntasAVersion(
        formularioId,
        data.copiarDeVersion,
        nuevoNumeroVersion,
      );
    }

    return {
      success: true,
      versionId,
      versionNumero: nuevoNumeroVersion,
      message: 'Versión creada exitosamente',
    };
  }

  // Columnas de Formulario_pregunta que NO se copian tal cual al clonar a
  // una versión nueva: fp_id es identity (se genera solo), y estas tres se
  // fuerzan a un valor propio de la versión nueva en vez de heredar el de
  // origen.
  private static readonly COLUMNAS_CLONAR_EXCLUIDAS = new Set([
    'fp_id',
    'fp_version',
    'fp_created_at',
  ]);

  // Columnas que apuntan a OTRA fila de Formulario_pregunta (fp_id de la
  // versión de origen) — tras clonar hay que reescribirlas para que
  // apunten al fp_id NUEVO del mismo pariente ya clonado, si no quedan
  // colgando de una pregunta de la versión vieja.
  private static readonly COLUMNAS_AUTORREFERENCIA = [
    'fp_pregunta_padre_id',
    'fp_tabla_limite_pregunta_id',
  ];

  // Clona todas las preguntas (y sus opciones) de `versionOrigen` a
  // `versionNueva`, dentro del mismo formulario.
  //
  // Antes esto tenía una lista de columnas a mano (~12 de las ~25 que
  // tiene la tabla) — cualquier columna agregada después (fp_codigo,
  // fp_tabla_columnas, fp_catalogo_*, fp_tipo_documento_id,
  // fp_oculto_en_formulario, ...) quedaba afuera en silencio: una pregunta
  // tipo tabla perdía sus columnas, un CATALOGO perdía el vínculo a su
  // tabla externa, una pregunta oculta (ver fp_oculto_en_formulario) volvía
  // a aparecer visible en la versión nueva. Ahora se lee la lista de
  // columnas de INFORMATION_SCHEMA, así que una columna nueva se copia
  // automáticamente sin tener que acordarse de tocar este método.
  private async copiarPreguntasAVersion(
    formularioId: number,
    versionOrigen: number,
    versionNueva: number,
  ) {
    const columnasInfo = await this.dataSource.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Formulario_pregunta'
      ORDER BY ORDINAL_POSITION
    `);
    const columnasACopiar: string[] = columnasInfo
      .map((c: { COLUMN_NAME: string }) => c.COLUMN_NAME)
      .filter(
        (c: string) => !FormulariosService.COLUMNAS_CLONAR_EXCLUIDAS.has(c),
      );

    const preguntasOrigen: any[] = await this.dataSource.query(
      `
        SELECT fp_id, ${columnasACopiar.map((c) => `[${c}]`).join(', ')}
        FROM Formulario_pregunta
        WHERE formulario_id = @0 AND ISNULL(fp_version, 1) = @1
      `,
      [formularioId, versionOrigen],
    );

    if (preguntasOrigen.length === 0) return;

    // fp_id de la versión de origen -> fp_id ya clonado en la versión nueva.
    // Cada INSERT necesita su propio viaje a la base para capturar el
    // fp_id que genera el IDENTITY (no se puede armar en un solo INSERT
    // multi-fila sin perder la correlación fila-a-fila) — pero con
    // concurrencia acotada en vez de uno por uno: un formulario real de
    // ~90 preguntas tardaba más de 2 minutos en secuencial contra la base
    // remota.
    const mapaIds = new Map<number, number>();
    await this.enConcurrencia(preguntasOrigen, 8, async (pregunta) => {
      const columnasInsert = [...columnasACopiar, 'fp_version', 'fp_created_at'];
      const valores: any[] = columnasACopiar.map((c) => pregunta[c]);
      const placeholders = valores.map((_, i) => `@${i}`);
      placeholders.push(`@${valores.length}`, 'SYSDATETIME()');
      valores.push(versionNueva);

      const insertResult = await this.dataSource.query(
        `
          INSERT INTO Formulario_pregunta (${columnasInsert.map((c) => `[${c}]`).join(', ')})
          OUTPUT INSERTED.fp_id
          VALUES (${placeholders.join(', ')})
        `,
        valores,
      );
      mapaIds.set(pregunta.fp_id, insertResult[0].fp_id);
    });

    // Reescribir las auto-referencias para que apunten al clon nuevo del
    // mismo pariente, no al de la versión de origen. Se filtra primero:
    // en la mayoría de los formularios son pocas preguntas condicionales
    // entre decenas simples, no vale la pena tocar la base por cada una.
    const conAutorreferencia = preguntasOrigen.filter((p) =>
      FormulariosService.COLUMNAS_AUTORREFERENCIA.some((c) => p[c]),
    );
    await this.enConcurrencia(conAutorreferencia, 8, async (pregunta) => {
      const nuevoPropioId = mapaIds.get(pregunta.fp_id);
      if (!nuevoPropioId) return;

      for (const columna of FormulariosService.COLUMNAS_AUTORREFERENCIA) {
        const viejoPadreId = pregunta[columna];
        if (!viejoPadreId) continue;
        const nuevoPadreId = mapaIds.get(viejoPadreId);
        if (!nuevoPadreId) continue;

        await this.dataSource.query(
          `UPDATE Formulario_pregunta SET [${columna}] = @0 WHERE fp_id = @1`,
          [nuevoPadreId, nuevoPropioId],
        );
      }
    });

    // Opciones: se copian por el fp_id exacto ya mapeado (no por
    // coincidencia de texto de la descripción — ya hay un caso real de dos
    // preguntas "Tipo de solicitud" con el mismo texto en Aviso legal), y
    // en un único INSERT set-based con la correlación viejo->nuevo inline,
    // en vez de una consulta por pregunta.
    const pares = Array.from(mapaIds.entries());
    for (const lote of this.enLotes(pares, 200)) {
      const params: number[] = [];
      const filasValues = lote
        .map(([viejoId, nuevoId]) => {
          const i = params.length;
          params.push(viejoId, nuevoId);
          return `(@${i}, @${i + 1})`;
        })
        .join(', ');

      await this.dataSource.query(
        `
          INSERT INTO Formulario_pregunta_opcion (fpo_fp_id, fpo_valor, fpo_estado)
          SELECT m.nuevo_id, fpo.fpo_valor, fpo.fpo_estado
          FROM Formulario_pregunta_opcion fpo
          INNER JOIN (VALUES ${filasValues}) AS m(viejo_id, nuevo_id)
            ON fpo.fpo_fp_id = m.viejo_id
        `,
        params,
      );
    }
  }

  private enLotes<T>(items: T[], tamano: number): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < items.length; i += tamano) {
      lotes.push(items.slice(i, i + tamano));
    }
    return lotes;
  }

  private async enConcurrencia<T>(
    items: T[],
    concurrencia: number,
    fn: (item: T) => Promise<void>,
  ) {
    let indice = 0;
    const trabajadores = Array.from(
      { length: Math.min(concurrencia, items.length) },
      async () => {
        while (indice < items.length) {
          const actual = items[indice++];
          await fn(actual);
        }
      },
    );
    await Promise.all(trabajadores);
  }

  async getFormularioCompleto(formularioId: number, version?: string) {
    const formulario = await this.obtenerPorId(formularioId);
    if (!formulario) {
      return null;
    }

    const versionNum = version
      ? parseInt(version)
      : formulario.formulario_version;

    const [secciones, preguntas, tipos, totalSolicitudesQueBloquean] = await Promise.all([
      this.dataSource.query(
        `
        SELECT
          fs_id,
          fs_nombre,
          fs_orden,
          fs_activo
        FROM Formulario_secciones
        ORDER BY fs_orden ASC
      `,
      ),
      this.dataSource.query(
        `
        SELECT
          fp_id,
          formulario_id,
          fp_descripcion,
          fp_tipo,
          fp_subtipo,
          seccion_id,
          fp_estado,
          fp_requerida,
          fp_orden,
          fp_version,
          fp_minimo,
          fp_maximo,
          fp_patron,
          fp_tabla_maestro,
          fp_pregunta_padre_id,
          fp_valor_padre_disparador,
          fp_catalogo_base_datos,
          fp_catalogo_tabla,
          fp_catalogo_columna,
          fp_catalogo_pk_column,
          fp_tipo_documento_id,
          fp_precarga_fuente,
          fp_precarga_campo_cliente,
          fp_tabla_columnas,
          fp_ancho_completo,
          fp_tabla_limite_modo,
          fp_tabla_limite_pregunta_id,
          fp_tabla_limite_reglas
        FROM Formulario_pregunta
        WHERE formulario_id = @0
          AND fp_version = @1
          AND fp_estado = 1
        ORDER BY fp_orden ASC
      `,
        [formularioId, versionNum],
      ),
      this.dataSource.query(`
        SELECT
          fti_id,
          fti_codigo,
          fti_descripcion
        FROM Formulario_tipo_input
        WHERE fti_estado = 1
        ORDER BY fti_codigo ASC
      `),
      // Mismo criterio que assertVersionSinSolicitudes: si esta versión ya
      // tiene solicitudes (sin contar Borradores), el frontend debe avisar
      // antes de que el usuario intente editar, no recién al fallar el
      // guardado.
      contarSolicitudesQueBloqueanVersion(this.dataSource, versionNum),
    ]);

    const idsConOpciones = preguntas
      .filter((p: { fp_tipo: string }) =>
        ['SELECT', 'MULTISELECT'].includes(p.fp_tipo),
      )
      .map((p: { fp_id: number }) => p.fp_id);

    let opcionesPorPregunta = new Map<number, any[]>();
    if (idsConOpciones.length > 0) {
      const placeholders = idsConOpciones
        .map((_: number, i: number) => `@${i}`)
        .join(', ');
      const opciones = await this.dataSource.query(
        `
          SELECT fpo_id, fpo_fp_id, fpo_valor, fpo_estado
          FROM Formulario_pregunta_opcion
          WHERE fpo_estado = 1
            AND fpo_fp_id IN (${placeholders})
        `,
        idsConOpciones,
      );

      opcionesPorPregunta = opciones.reduce(
        (acc: Map<number, any[]>, op: any) => {
          const normalizada = {
            ...op,
            fpo_valor: normalizeMojibake(op.fpo_valor),
          };
          const lista = acc.get(op.fpo_fp_id) || [];
          lista.push(normalizada);
          acc.set(op.fpo_fp_id, lista);
          return acc;
        },
        new Map<number, any[]>(),
      );
    }

    const preguntasConOpciones = preguntas.map((p: { fp_id: number }) => ({
      ...p,
      opciones: opcionesPorPregunta.get(p.fp_id) || [],
    }));

    return {
      formulario: {
        ...formulario,
        tiene_solicitudes: totalSolicitudesQueBloquean > 0,
      },
      secciones,
      preguntas: preguntasConOpciones,
      tiposPregunta: tipos,
    };
  }
}
