import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';

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
        ISNULL((SELECT MAX(v.fv_numero) FROM Formulario_versiones v WHERE v.fv_frm_id = f.frm_id), 1) AS formulario_version,
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
        ISNULL((SELECT MAX(v.fv_numero) FROM Formulario_versiones v WHERE v.fv_frm_id = f.frm_id), 1) AS formulario_version,
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
        ISNULL((SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frm_id = f.frm_id), 1) AS formulario_version
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
      `SELECT frm_id FROM formularios WHERE frm_id = @0`,
      [formularioId],
    );

    if (existe.length === 0) {
      return false;
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
        ISNULL((SELECT MAX(fv_numero) FROM Formulario_versiones WHERE fv_frm_id = @0), 1) AS formulario_version
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
        (SELECT COUNT(*) FROM Formulario_pregunta WHERE formulario_id = @0 AND ISNULL(fp_version, 1) = fv_numero) AS total_preguntas
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
    await this.dataSource.query(
      `
      UPDATE formularios
      SET formulario_version = @1
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
    const formulario = await this.dataSource.query(
      `SELECT formulario_version FROM formularios WHERE frm_id = @0`,
      [formularioId],
    );

    if (formulario.length === 0) {
      throw new Error('Formulario no encontrado');
    }

    if (formulario[0].formulario_version === versionNumero) {
      throw new Error('No se puede eliminar la versión activa');
    }

    const usedInSolicitudes = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM solicitudes WHERE formulario_version = @0`,
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
      await this.dataSource.query(
        `
          INSERT INTO Formulario_pregunta (
            fp_descripcion,
            fp_tipo,
            fp_estado,
            fp_orden,
            fp_created_at,
            fp_subtipo,
            fp_patron,
            fp_tabla_maestro,
            fp_requerida,
            seccion_id,
            formulario_id,
            fp_version
          )
          SELECT
            fp_descripcion,
            fp_tipo,
            fp_estado,
            fp_orden,
            ISNULL(fp_created_at, SYSDATETIME()),
            fp_subtipo,
            fp_patron,
            fp_tabla_maestro,
            fp_requerida,
            seccion_id,
            formulario_id,
            @0
          FROM Formulario_pregunta
          WHERE formulario_id = @1
          AND ISNULL(fp_version, 1) = @2
        `,
        [nuevoNumeroVersion, formularioId, data.copiarDeVersion],
      );

      await this.dataSource.query(
        `
          INSERT INTO Formulario_pregunta_opcion (fpo_fp_id, fpo_valor, fpo_estado)
          SELECT
            (SELECT TOP 1 fp2.fp_id
             FROM Formulario_pregunta fp2
             WHERE fp2.fp_descripcion = fp1.fp_descripcion
             AND fp2.formulario_id = @0
             AND ISNULL(fp2.fp_version, 1) = @1),
            fpo.fpo_valor,
            fpo.fpo_estado
          FROM Formulario_pregunta_opcion fpo
          INNER JOIN Formulario_pregunta fp1 ON fpo.fpo_fp_id = fp1.fp_id
          WHERE fp1.formulario_id = @0
          AND ISNULL(fp1.fp_version, 1) = @2
        `,
        [formularioId, nuevoNumeroVersion, data.copiarDeVersion],
      );
    }

    await this.dataSource.query(
      `
        UPDATE formularios
        SET Formulario_versiones_totales = @0
        WHERE frm_id = @1
      `,
      [nuevoNumeroVersion, formularioId],
    );

    return {
      success: true,
      versionId,
      versionNumero: nuevoNumeroVersion,
      message: 'Versión creada exitosamente',
    };
  }

  async getFormularioCompleto(formularioId: number, version?: string) {
    const formulario = await this.obtenerPorId(formularioId);
    if (!formulario) {
      return null;
    }

    const versionNum = version
      ? parseInt(version)
      : formulario.formulario_version;

    const [secciones, preguntas, tipos] = await Promise.all([
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
      formulario,
      secciones,
      preguntas: preguntasConOpciones,
      tiposPregunta: tipos,
    };
  }
}
