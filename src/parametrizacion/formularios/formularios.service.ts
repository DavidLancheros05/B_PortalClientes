import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';
import {
  contarSolicitudesQueBloqueanVersion,
  resolverFvId,
} from './version-formulario.util';

export interface Formularios_solicitudes {
  frs_id: number;
  frs_nombre: string;
  frs_descripcion: string | null;
  frs_activo: boolean;
  formulario_version: number;
  Formulario_versiones_totales: number;
  created_at: string;
}

// Número visible de la versión activa del formulario `alias` (fila de
// Formularios_solicitudes). Si no hay versión activa marcada cae a la más
// reciente, y a 1 si no tiene ninguna.
const sqlVersionActiva = (alias: string) =>
  `ISNULL((SELECT va.fv_numero FROM Formulario_versiones va WHERE va.fv_id = ${alias}.frs_fv_id_activa), ` +
  `ISNULL((SELECT MAX(vm.fv_numero) FROM Formulario_versiones vm WHERE vm.fv_frs_id = ${alias}.frs_id), 1))`;

// 547 = violación de FK/CHECK en SQL Server. Al borrar, la única FK que puede
// saltar es FK_solicitudes_formulario_version: una solicitud creada entre el
// conteo previo y el DELETE.
const esViolacionFk = (error: any) =>
  (error?.driverError?.number ?? error?.number) === 547;

// "N solicitudes (M borradores)": los borradores también bloquean el borrado
// (la FK los ve), aunque no bloqueen editar la versión.
const describirSolicitudes = (total: number, borradores: number) =>
  borradores > 0
    ? `${total} solicitud(es), de las cuales ${borradores} son borradores`
    : `${total} solicitud(es)`;

@Injectable()
export class FormulariosService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(
    busqueda?: string,
    estado?: 'ACTIVO' | 'INACTIVO' | 'TODOS',
  ): Promise<Formularios_solicitudes[]> {
    let query = `
      SELECT
        f.frs_id,
        f.frs_nombre,
        f.frs_descripcion,
        f.frs_activo,
        f.frs_created_at AS created_at,
        ${sqlVersionActiva('f')} AS formulario_version,
        ISNULL((SELECT COUNT(*) FROM Formulario_versiones v WHERE v.fv_frs_id = f.frs_id), 0) AS Formulario_versiones_totales
      FROM Formularios_solicitudes f
      WHERE 1=1
    `;

    const params: string[] = [];
    if (busqueda && busqueda.trim()) {
      params.push(`%${busqueda.trim()}%`);
      query += ` AND (
        f.frs_nombre LIKE @0
        OR f.frs_descripcion LIKE @0
      )`;
    }

    if (estado === 'ACTIVO') {
      query += ` AND f.frs_activo = 1`;
    } else if (estado === 'INACTIVO') {
      query += ` AND f.frs_activo = 0`;
    }

    query += ` ORDER BY f.frs_id DESC`;

    const result = await this.dataSource.query(query, params);
    return result;
  }

  async obtenerPorId(
    formularioId: number,
  ): Promise<Formularios_solicitudes | null> {
    const result = await this.dataSource.query(
      `
      SELECT
        f.frs_id,
        f.frs_nombre,
        f.frs_descripcion,
        f.frs_activo,
        f.frs_created_at AS created_at,
        ${sqlVersionActiva('f')} AS formulario_version,
        ISNULL((SELECT COUNT(*) FROM Formulario_versiones v WHERE v.fv_frs_id = f.frs_id), 0) AS Formulario_versiones_totales
      FROM Formularios_solicitudes f
      WHERE f.frs_id = @0
    `,
      [formularioId],
    );

    return result[0] || null;
  }

  async obtenerActivo() {
    const result = await this.dataSource.query(`
      SELECT TOP 1
        f.frs_id,
        f.frs_nombre,
        f.frs_descripcion,
        ${sqlVersionActiva('f')} AS formulario_version
      FROM Formularios_solicitudes f
      WHERE f.frs_activo = 1
      ORDER BY f.frs_id
    `);

    return result[0] || null;
  }

  async crear(
    nombre: string,
    descripcion?: string,
  ): Promise<Formularios_solicitudes> {
    // Formulario + versión inicial en una transacción: antes eran dos
    // consultas sueltas y un fallo en la segunda dejaba un formulario sin
    // versión. La versión inicial queda marcada como activa: sin eso,
    // obtenerFvIdFormularioActivo rechaza crear solicitudes con este
    // formulario ("no tiene versión activa").
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let insertResult: any[];
    try {
      insertResult = await queryRunner.query(
        `
      DECLARE @frs TABLE (
        frs_id INT, frs_nombre NVARCHAR(MAX), frs_descripcion NVARCHAR(MAX),
        frs_activo BIT, created_at DATETIME2
      );
      INSERT INTO Formularios_solicitudes (
        frs_nombre,
        frs_descripcion,
        frs_activo,
        frs_created_at,
        frs_updated_at
      )
      OUTPUT
        INSERTED.frs_id,
        INSERTED.frs_nombre,
        INSERTED.frs_descripcion,
        INSERTED.frs_activo,
        INSERTED.frs_created_at
      INTO @frs
      VALUES (
        @0,
        @1,
        1,
        dbo.fn_ahora_colombia(),
        dbo.fn_ahora_colombia()
      );

      DECLARE @frs_id INT = (SELECT frs_id FROM @frs);
      DECLARE @fv TABLE (fv_id INT);
      INSERT INTO Formulario_versiones (
        fv_frs_id,
        fv_numero,
        fv_descripcion,
        fv_created_at
      )
      OUTPUT INSERTED.fv_id INTO @fv
      VALUES (
        @frs_id,
        1,
        'Versión inicial',
        dbo.fn_ahora_colombia()
      );
      UPDATE Formularios_solicitudes
      SET frs_fv_id_activa = (SELECT fv_id FROM @fv)
      WHERE frs_id = @frs_id;

      SELECT * FROM @frs;
    `,
        [nombre, descripcion || null],
      );
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const nuevoFormulario = insertResult[0];

    return {
      ...nuevoFormulario,
      formulario_version: 1,
      Formulario_versiones_totales: 1,
    };
  }

  async eliminar(formularioId: number): Promise<boolean> {
    const existe = await this.dataSource.query(
      `SELECT frs_id, frs_activo FROM Formularios_solicitudes WHERE frs_id = @0`,
      [formularioId],
    );

    if (existe.length === 0) {
      return false;
    }

    if (existe[0].frs_activo) {
      throw new Error(
        'No se puede eliminar el formulario activo. Actívalo desde otro formulario primero.',
      );
    }

    const [uso] = await this.dataSource.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN sol_ses_id = 1 THEN 1 ELSE 0 END) AS borradores
      FROM solicitudes
      WHERE sol_fv_id IN (
        SELECT fv_id FROM Formulario_versiones WHERE fv_frs_id = @0
      )
      `,
      [formularioId],
    );

    if (uso.total > 0) {
      throw new Error(
        `No se puede eliminar el formulario porque sus versiones tienen ${describirSolicitudes(uso.total, uso.borradores)}.`,
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
          WHERE fp_fv_id IN (SELECT fv_id FROM Formulario_versiones WHERE fv_frs_id = @0)
        )
      `,
        [formularioId],
      );

      // Por versión, igual que secciones y versiones abajo: lo que bloquea
      // el DELETE de Formulario_versiones es fp_fv_id, no fp_frs_id.
      await queryRunner.query(
        `DELETE FROM Formulario_pregunta
         WHERE fp_fv_id IN (SELECT fv_id FROM Formulario_versiones WHERE fv_frs_id = @0)`,
        [formularioId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_secciones
         WHERE fs_fv_id IN (SELECT fv_id FROM Formulario_versiones WHERE fv_frs_id = @0)`,
        [formularioId],
      );

      // FK_Formularios_solicitudes_version_activa: soltar la versión activa
      // antes de borrar las versiones.
      await queryRunner.query(
        `UPDATE Formularios_solicitudes SET frs_fv_id_activa = NULL WHERE frs_id = @0`,
        [formularioId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_versiones WHERE fv_frs_id = @0`,
        [formularioId],
      );

      await queryRunner.query(
        `DELETE FROM Formularios_solicitudes WHERE frs_id = @0`,
        [formularioId],
      );

      await queryRunner.commitTransaction();
      return true;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (esViolacionFk(error)) {
        throw new Error(
          'No se puede eliminar el formulario porque se acaba de crear una solicitud con una de sus versiones.',
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async obtenerVersiones(formularioId: number) {
    const formulario = await this.dataSource.query(
      `
      SELECT
        f.frs_id,
        f.frs_nombre,
        f.frs_activo,
        ${sqlVersionActiva('f')} AS formulario_version
      FROM Formularios_solicitudes f
      WHERE f.frs_id = @0
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
        fv_descripcion AS version_descripcion,
        fv_created_at AS created_at,
        fv_created_by AS created_by,
        -- Solo activas: las desactivadas no salen en el editor ni al diligenciar.
        (SELECT COUNT(*) FROM Formulario_pregunta WHERE fp_fv_id = fv_id AND fp_estado = 1) AS total_preguntas,
        -- Necesita este conteo por CADA versión a la vez, así que va inline
        -- como subquery correlacionada en vez de llamar a
        -- contarSolicitudesQueBloqueanVersion() (./version-formulario.util)
        -- en un loop. La condición (sol_ses_id <> 1, un borrador no
        -- cuenta) debe mantenerse igual a la de ese util — es la misma
        -- regla de negocio, ver el comentario ahí para el porqué.
        (SELECT COUNT(*) FROM solicitudes WHERE sol_fv_id = fv_id AND sol_ses_id <> 1) AS total_solicitudes
      FROM Formulario_versiones
      WHERE fv_frs_id = @0
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
    // La versión activa es frs_fv_id_activa (FK a Formulario_versiones).
    const fvId = await resolverFvId(
      this.dataSource,
      formularioId,
      versionNumero,
    );
    if (!fvId) {
      throw new Error(
        `La versión ${versionNumero} no existe para este formulario`,
      );
    }

    await this.dataSource.query(
      `
      UPDATE Formularios_solicitudes
      SET frs_fv_id_activa = @1
      WHERE frs_id = @0
    `,
      [formularioId, fvId],
    );

    return {
      success: true,
      message: `Versión ${versionNumero} activada exitosamente`,
    };
  }

  async eliminarVersion(formularioId: number, versionNumero: number) {
    // "versión activa" = frs_fv_id_activa (la fija activarVersion; crear()
    // ya deja marcada la versión inicial).
    const formulario = await this.dataSource.query(
      `SELECT frs_id, frs_fv_id_activa FROM Formularios_solicitudes WHERE frs_id = @0`,
      [formularioId],
    );

    if (formulario.length === 0) {
      throw new Error('Formulario no encontrado');
    }

    const fvId = await resolverFvId(
      this.dataSource,
      formularioId,
      versionNumero,
    );
    if (!fvId) {
      throw new Error(
        `La versión ${versionNumero} no existe para este formulario`,
      );
    }

    if (formulario[0].frs_fv_id_activa === fvId) {
      throw new Error('No se puede eliminar la versión activa');
    }

    const [uso] = await this.dataSource.query(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN sol_ses_id = 1 THEN 1 ELSE 0 END) AS borradores
       FROM solicitudes WHERE sol_fv_id = @0`,
      [fvId],
    );

    if (uso.total > 0) {
      throw new Error(
        `No se puede eliminar la versión porque tiene ${describirSolicitudes(uso.total, uso.borradores)}.`,
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
          WHERE fp_fv_id = @0
        )
      `,
        [fvId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_pregunta WHERE fp_fv_id = @0`,
        [fvId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_secciones WHERE fs_fv_id = @0`,
        [fvId],
      );

      await queryRunner.query(
        `DELETE FROM Formulario_versiones WHERE fv_id = @0`,
        [fvId],
      );

      await queryRunner.commitTransaction();
      return {
        success: true,
        message: `Versión ${versionNumero} eliminada exitosamente`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (esViolacionFk(error)) {
        // Entre las validaciones y el DELETE alguien la activó o creó una
        // solicitud con ella (FK de frs_fv_id_activa o de sol_fv_id).
        throw new Error(
          `No se puede eliminar la versión ${versionNumero}: se acaba de activar o de usar en una solicitud.`,
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
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

    let fvIdOrigen: number | null = null;
    if (data.copiarDeVersion) {
      fvIdOrigen = await resolverFvId(
        this.dataSource,
        formularioId,
        data.copiarDeVersion,
      );
      if (!fvIdOrigen) {
        throw new Error(
          `La versión ${data.copiarDeVersion} no existe para este formulario`,
        );
      }
    }
    const columnas = fvIdOrigen ? await this.columnasAClonar() : null;

    // Todo en una transacción:
    // antes la versión se insertaba y el clonado iba en consultas sueltas, así
    // que un fallo a mitad dejaba una versión a medio copiar.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // MAX + 1 dentro de la transacción; UQ_Formulario_versiones_frs_numero
      // rechaza el duplicado si dos personas crean una versión a la vez.
      const [version] = await queryRunner.query(
        `
        DECLARE @v TABLE (fv_id INT, fv_numero INT);
        INSERT INTO Formulario_versiones
          (fv_frs_id, fv_numero, fv_descripcion, fv_created_at, fv_created_by)
        OUTPUT INSERTED.fv_id, INSERTED.fv_numero INTO @v
        SELECT @0, ISNULL(MAX(fv_numero), 0) + 1, @1, dbo.fn_ahora_colombia(), @2
        FROM Formulario_versiones WITH (UPDLOCK, HOLDLOCK)
        WHERE fv_frs_id = @0;
        SELECT fv_id, fv_numero FROM @v;
        `,
        [
          formularioId,
          String(data.descripcion || '').trim() || null,
          // Sin usuario queda NULL, no a nombre del admin 1.
          Number(data.usuarioId) || null,
        ],
      );

      if (fvIdOrigen && columnas) {
        await this.clonarContenidoVersion(
          queryRunner,
          columnas,
          fvIdOrigen,
          version.fv_id,
        );
      }

      await queryRunner.commitTransaction();
      return {
        success: true,
        versionId: version.fv_id,
        versionNumero: version.fv_numero,
        message: 'Versión creada exitosamente',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // Columnas que apuntan a OTRA fila de Formulario_pregunta (fp_id de la
  // versión de origen) — tras clonar hay que reescribirlas para que
  // apunten al fp_id NUEVO del mismo pariente ya clonado. Las FKs
  // (columna, fp_fv_id) -> (fp_id, fp_fv_id) no dejan insertarlas con el
  // valor viejo, así que se insertan en NULL y se asignan después.
  private static readonly COLUMNAS_AUTORREFERENCIA = [
    'fp_pregunta_padre_id',
    'fp_tabla_limite_pregunta_id',
    'fp_catalogo_filtro_pregunta_id',
  ];

  // Columnas que NO se copian tal cual al clonar: las identity, las que toman
  // un valor propio de la versión nueva y las autorreferencias (ver arriba).
  private static readonly COLUMNAS_CLONAR_EXCLUIDAS: Record<string, string[]> =
    {
      Formulario_secciones: ['fs_id', 'fs_fv_id', 'fs_created_at'],
      Formulario_pregunta: [
        'fp_id',
        'fp_fv_id',
        'fp_created_at',
        'fp_fs_id',
        ...FormulariosService.COLUMNAS_AUTORREFERENCIA,
      ],
      Formulario_pregunta_opcion: ['fpo_id', 'fpo_fp_id'],
    };

  // La lista de columnas sale de INFORMATION_SCHEMA, así que una columna
  // nueva se copia sola. Antes preguntas tenía una lista a mano (~12 de ~25):
  // cualquier columna agregada después (fp_codigo, fp_tabla_columnas,
  // fp_catalogo_*, fp_oculto_en_formulario...) se perdía en silencio al
  // clonar; opciones seguía con lista a mano.
  private async columnasAClonar(): Promise<Record<string, string[]>> {
    const filas: { TABLE_NAME: string; COLUMN_NAME: string }[] = await this
      .dataSource.query(`
        SELECT TABLE_NAME, COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME IN ('Formulario_secciones', 'Formulario_pregunta', 'Formulario_pregunta_opcion')
          AND COLUMNPROPERTY(OBJECT_ID(TABLE_NAME), COLUMN_NAME, 'IsComputed') = 0
        ORDER BY TABLE_NAME, ORDINAL_POSITION
      `);
    const resultado: Record<string, string[]> = {};
    for (const tabla of Object.keys(
      FormulariosService.COLUMNAS_CLONAR_EXCLUIDAS,
    )) {
      const excluidas = new Set(
        FormulariosService.COLUMNAS_CLONAR_EXCLUIDAS[tabla],
      );
      resultado[tabla] = filas
        .filter((f) => f.TABLE_NAME === tabla && !excluidas.has(f.COLUMN_NAME))
        .map((f) => f.COLUMN_NAME);
    }
    return resultado;
  }

  // Clona secciones, preguntas y opciones de `fvIdOrigen` a `fvIdNueva` en un
  // solo lote SQL. MERGE ... OUTPUT devuelve la
  // pareja id viejo -> id nuevo, que un INSERT ... SELECT no puede dar; con eso
  // se reasignan secciones, autorreferencias y opciones sin un viaje a la base
  // por fila (uno por fila tardaba más de 2 minutos contra la base remota, y
  // dentro de una transacción no se puede repartir en varias conexiones).
  private async clonarContenidoVersion(
    queryRunner: QueryRunner,
    columnas: Record<string, string[]>,
    fvIdOrigen: number,
    fvIdNueva: number,
  ) {
    const lista = (cols: string[], prefijo = '') =>
      cols.map((c) => `${prefijo}[${c}]`).join(', ');
    const cSec = columnas.Formulario_secciones;
    const cPreg = columnas.Formulario_pregunta;
    const cOpc = columnas.Formulario_pregunta_opcion;
    // La copia quedó con la autorreferencia en NULL; el valor viejo se lee de
    // la pregunta de origen (o) y se traduce con @preg. Si una pregunta activa
    // apunta a algo que no se clonó, se aborta: antes quedaba apuntando a la
    // versión vieja sin avisar. En una desactivada (arrastrada solo porque
    // otra la referencia) la referencia sin pareja se deja en NULL.
    const remapeos = FormulariosService.COLUMNAS_AUTORREFERENCIA.map(
      (c) => `
      IF EXISTS (
        SELECT 1 FROM @preg yo
        JOIN Formulario_pregunta o ON o.fp_id = yo.viejo
        WHERE o.[${c}] IS NOT NULL AND o.fp_estado = 1
          AND NOT EXISTS (SELECT 1 FROM @preg m WHERE m.viejo = o.[${c}])
      )
        THROW 50021, 'Clonado: una pregunta activa referencia (${c}) una pregunta que no se copió a la versión nueva.', 1;

      UPDATE p SET p.[${c}] = m.nuevo
      FROM Formulario_pregunta p
      JOIN @preg yo ON yo.nuevo = p.fp_id
      JOIN Formulario_pregunta o ON o.fp_id = yo.viejo
      JOIN @preg m ON m.viejo = o.[${c}];`,
    ).join('\n');

    await queryRunner.query(
      `
      DECLARE @secc TABLE (viejo INT, nuevo INT);
      DECLARE @preg TABLE (viejo INT, nuevo INT);

      MERGE Formulario_secciones AS t
      USING (SELECT * FROM Formulario_secciones WHERE fs_fv_id = @0) AS s
      ON 1 = 0
      WHEN NOT MATCHED THEN
        INSERT (${lista(cSec)}, fs_fv_id, fs_created_at)
        VALUES (${lista(cSec, 's.')}, @1, dbo.fn_ahora_colombia())
      OUTPUT s.fs_id, INSERTED.fs_id INTO @secc (viejo, nuevo);

      MERGE Formulario_pregunta AS t
      USING (
        SELECT p.*, ms.nuevo AS fs_nuevo
        FROM Formulario_pregunta p
        LEFT JOIN @secc ms ON ms.viejo = p.fp_fs_id
        WHERE p.fp_fv_id = @0
          -- Las desactivadas no se arrastran (nada las reactiva), salvo que
          -- una activa las referencie: sin ellas el remapeo de abajo no
          -- encontraría pareja y la referencia quedaría en la versión vieja.
          AND (
            p.fp_estado = 1
            OR EXISTS (
              SELECT 1 FROM Formulario_pregunta a
              WHERE a.fp_fv_id = @0 AND a.fp_estado = 1
                AND p.fp_id IN (${FormulariosService.COLUMNAS_AUTORREFERENCIA.map((c) => `a.[${c}]`).join(', ')})
            )
          )
      ) AS s
      ON 1 = 0
      WHEN NOT MATCHED THEN
        INSERT (${lista(cPreg)}, fp_fs_id, fp_fv_id, fp_created_at)
        VALUES (${lista(cPreg, 's.')}, ISNULL(s.fs_nuevo, s.fp_fs_id), @1, dbo.fn_ahora_colombia())
      OUTPUT s.fp_id, INSERTED.fp_id INTO @preg (viejo, nuevo);

      ${remapeos}

      INSERT INTO Formulario_pregunta_opcion (fpo_fp_id, ${lista(cOpc)})
      SELECT m.nuevo, ${lista(cOpc, 'o.')}
      FROM Formulario_pregunta_opcion o
      JOIN @preg m ON m.viejo = o.fpo_fp_id
      WHERE o.fpo_estado = 1
      -- Las opciones se muestran por fpo_id: con ORDER BY, SQL Server asigna
      -- los identity nuevos en este orden; sin él no lo garantiza.
      ORDER BY o.fpo_id;
      `,
      [fvIdOrigen, fvIdNueva],
    );
  }

  async getFormularioCompleto(formularioId: number, version?: string) {
    const formulario = await this.obtenerPorId(formularioId);
    if (!formulario) {
      return null;
    }

    const versionNum = version
      ? Number(version)
      : formulario.formulario_version;
    if (!Number.isInteger(versionNum) || versionNum <= 0) {
      throw new BadRequestException(`Versión inválida: ${version}`);
    }
    const fvId = await resolverFvId(this.dataSource, formularioId, versionNum);
    if (!fvId) {
      throw new NotFoundException(
        `La versión ${versionNum} no existe para este formulario`,
      );
    }

    const [secciones, preguntas, tipos, totalSolicitudesQueBloquean] =
      await Promise.all([
        // SELECT * por lo mismo que en preguntas (abajo): el editor de
        // secciones devuelve fs_oculta_en_formulario y fs_descripcion.
        this.dataSource.query(
          `
        SELECT *
        FROM Formulario_secciones
        WHERE fs_fv_id = @0
        ORDER BY fs_orden ASC
      `,
          [fvId],
        ),
        // SELECT * a propósito: el editor devuelve al guardar todo lo que
        // recibe, y una columna que faltara acá le llegaba vacía y pisaba la
        // configuración guardada (pasó con fp_oculto_en_formulario y
        // fp_catalogo_filtro_*). Mismo criterio que columnasAClonar().
        this.dataSource.query(
          `
        SELECT *
        FROM Formulario_pregunta
        WHERE fp_fv_id = @0
          AND fp_estado = 1
        ORDER BY fp_orden ASC
      `,
          [fvId],
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
        contarSolicitudesQueBloqueanVersion(this.dataSource, fvId),
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
          SELECT fpo_id, fpo_fp_id, fpo_valor, fpo_codigo, fpo_estado
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

    const preguntasConOpciones = preguntas.map(
      (p: { fp_id: number }) => ({
        ...p,
        frs_id: formularioId,
        opciones: opcionesPorPregunta.get(p.fp_id) || [],
      }),
    );

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
