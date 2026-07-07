import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TABLAS, COLUMNAS } from '../common/constants/tablas.constants';

interface ColumnInfo {
  name: string;
  dataType: string;
}

@Injectable()
export class MaestrosService {
  constructor(private readonly dataSource: DataSource) {}

  private isSafeIdentifier(value: string): boolean {
    return /^[A-Za-z0-9_]+$/.test(value);
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  private resolveColumns(tableName: string, columns: ColumnInfo[]) {
    const normalizedTable = this.normalize(tableName).replace(/s$/, '');
    const normalizedCols = columns.map((col) => ({
      original: col.name,
      normalized: this.normalize(col.name),
      dataType: this.normalize(col.dataType),
    }));

    const idPriority = [
      'id',
      `${normalizedTable}_id`,
      `${this.normalize(tableName)}_id`,
      'pais_id',
      'depto_id',
      'ciudad_id',
      'dep_id',
      'ciu_id',
      'pai_id',
    ];

    const labelPriority = [
      'nombre',
      'descripcion',
      'valor',
      `${normalizedTable}_nombre`,
      `${this.normalize(tableName)}_nombre`,
      'pais_nombre',
      'depto_nombre',
      'ciudad_nombre',
      'dep_nombre',
      'ciu_nombre',
      'pai_nombre',
    ];

    const activePriority = [
      'activo',
      'estado',
      `${normalizedTable}_activo`,
      `${this.normalize(tableName)}_activo`,
      'pais_activo',
      'depto_activo',
      'ciudad_activo',
      'dep_activo',
      'ciu_activo',
      'pai_activo',
    ];

    const idColumn =
      normalizedCols.find((col) => idPriority.includes(col.normalized))
        ?.original ??
      normalizedCols.find((col) => col.normalized.endsWith('_id'))?.original;

    const labelColumn =
      normalizedCols.find((col) => labelPriority.includes(col.normalized))
        ?.original ??
      normalizedCols.find(
        (col) =>
          ['nvarchar', 'varchar', 'char', 'nchar', 'text', 'ntext'].includes(
            col.dataType,
          ) && col.original !== idColumn,
      )?.original;

    const activeColumn = normalizedCols.find((col) =>
      activePriority.includes(col.normalized),
    )?.original;

    return { idColumn, labelColumn, activeColumn };
  }

  private async getCatalogoGeografico(config: {
    tabla: string;
    columnas: { id: string; nombre: string; parentId?: string; estado: string };
    idAlias: string;
    nombreAlias: string;
    parentIdAlias?: string;
    parentValue?: number;
  }) {
    const {
      tabla,
      columnas,
      idAlias,
      nombreAlias,
      parentIdAlias,
      parentValue,
    } = config;

    let query = `
      SELECT
        ${columnas.id} AS ${idAlias},
        ${columnas.nombre} AS ${nombreAlias}
    `;

    if (parentIdAlias && columnas.parentId) {
      query += `,\n        ${columnas.parentId} AS ${parentIdAlias}`;
    }

    query += `
      FROM dbo.${tabla}
      WHERE ${columnas.estado} = 'A'
    `;

    const params: any[] = [];

    if (parentValue !== undefined && columnas.parentId) {
      query += `\n        AND ${columnas.parentId} = @0`;
      params.push(parentValue);
    }

    query += `\n      ORDER BY ${columnas.nombre}`;

    return this.dataSource.query(query, params);
  }

  async getPaises() {
    return this.getCatalogoGeografico({
      tabla: TABLAS.PAIS,
      columnas: COLUMNAS.PAIS,
      idAlias: 'pais_id',
      nombreAlias: 'pais_nombre',
    });
  }

  async getDepartamentos(pais_id: number) {
    return this.getCatalogoGeografico({
      tabla: TABLAS.DEPARTAMENTOS,
      columnas: COLUMNAS.DEPARTAMENTOS,
      idAlias: 'depto_id',
      nombreAlias: 'depto_nombre',
      parentIdAlias: 'pais_id',
      parentValue: pais_id,
    });
  }

  async getCiudades(depto_id: number) {
    return this.getCatalogoGeografico({
      tabla: TABLAS.CIUDADES,
      columnas: COLUMNAS.CIUDADES,
      idAlias: 'ciudad_id',
      nombreAlias: 'ciudad_nombre',
      parentIdAlias: 'depto_id',
      parentValue: depto_id,
    });
  }

  async getCatalogo(
    tabla: string,
    baseDatos?: string,
    columnaDescripcion?: string,
  ) {
    if (!tabla) {
      throw new BadRequestException('El parámetro tabla es requerido');
    }

    if (!this.isSafeIdentifier(tabla)) {
      throw new BadRequestException('Nombre de tabla inválido');
    }

    if (baseDatos && !this.isSafeIdentifier(baseDatos)) {
      throw new BadRequestException('Nombre de base de datos inválido');
    }

    if (columnaDescripcion && !this.isSafeIdentifier(columnaDescripcion)) {
      throw new BadRequestException('Nombre de columna inválido');
    }

    const currentDbResult = await this.dataSource.query(
      `SELECT DB_NAME() AS db_name`,
    );
    const currentDb = String(currentDbResult?.[0]?.db_name ?? '').trim();
    const targetDb = baseDatos || currentDb;

    const columnsQuery = `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM [${targetDb}].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0
      ORDER BY ORDINAL_POSITION
    `;

    const columnsResult = await this.dataSource.query(columnsQuery, [tabla]);
    const columns = columnsResult.map((row: any) => ({
      name: String(row.COLUMN_NAME),
      dataType: String(row.DATA_TYPE),
    }));

    if (columns.length === 0) {
      throw new BadRequestException(
        `No existe la tabla dbo.${tabla} en la base ${targetDb}`,
      );
    }

    const { idColumn, labelColumn, activeColumn } = this.resolveColumns(
      tabla,
      columns,
    );

    let effectiveLabelColumn = labelColumn;
    if (columnaDescripcion) {
      const existsSelectedLabel = columns.some(
        (column) =>
          this.normalize(column.name) === this.normalize(columnaDescripcion),
      );
      if (!existsSelectedLabel) {
        throw new BadRequestException(
          `La columna ${columnaDescripcion} no existe en la tabla ${tabla}`,
        );
      }
      effectiveLabelColumn =
        columns.find(
          (column) =>
            this.normalize(column.name) === this.normalize(columnaDescripcion),
        )?.name ?? columnaDescripcion;
    }

    if (!idColumn || !effectiveLabelColumn) {
      throw new BadRequestException(
        'No fue posible identificar columnas id/nombre para el catálogo. Verifica la estructura de la tabla.',
      );
    }

    const whereActive = activeColumn ? `WHERE [${activeColumn}] = 1` : '';

    const dataQuery = `
      SELECT
        TRY_CONVERT(INT, [${idColumn}]) AS op_id,
        CAST([${effectiveLabelColumn}] AS NVARCHAR(255)) AS op_descripcion
      FROM [${targetDb}].[dbo].[${tabla}]
      ${whereActive}
      ORDER BY [${effectiveLabelColumn}]
    `;

    const dataResult = await this.dataSource.query(dataQuery);

    return dataResult
      .filter((row: any) => row.op_id !== null && row.op_descripcion !== null)
      .map((row: any) => ({
        op_id: Number(row.op_id),
        op_descripcion: String(row.op_descripcion),
      }));
  }

  async getCatalogoDocumentos(mode: 'options' | 'full' = 'options') {
    const columnsResult = await this.dataSource.query(`
      SELECT
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_id') IS NOT NULL THEN 'tdo_id'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tipo_documento_id') IS NOT NULL THEN 'tipo_documento_id'
          ELSE ''
        END AS id_col,
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_nombre') IS NOT NULL THEN 'tdo_nombre'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'nombre') IS NOT NULL THEN 'nombre'
          ELSE ''
        END AS nombre_col,
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_descripcion') IS NOT NULL THEN 'tdo_descripcion'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'descripcion') IS NOT NULL THEN 'descripcion'
          ELSE ''
        END AS descripcion_col,
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_estado') IS NOT NULL THEN 'tdo_estado'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'estado') IS NOT NULL THEN 'estado'
          ELSE ''
        END AS estado_col,
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_obligatorio') IS NOT NULL THEN 'tdo_obligatorio'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'obligatorio') IS NOT NULL THEN 'obligatorio'
          ELSE ''
        END AS obligatorio_col,
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_vigencia_dias') IS NOT NULL THEN 'tdo_vigencia_dias'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'vigencia_dias') IS NOT NULL THEN 'vigencia_dias'
          ELSE ''
        END AS vigencia_col,
        CASE
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'tdo_permite_vencimiento') IS NOT NULL THEN 'tdo_permite_vencimiento'
          WHEN COL_LENGTH('dbo.Tipos_documentos', 'permite_vencimiento') IS NOT NULL THEN 'permite_vencimiento'
          ELSE ''
        END AS permite_col
    `);

    const [cols] = columnsResult;
    const idCol = String(cols.id_col ?? '').trim();
    const nombreCol = String(cols.nombre_col ?? '').trim();
    const descripcionCol = String(cols.descripcion_col ?? '').trim();
    const estadoCol = String(cols.estado_col ?? '').trim();
    const obligatorioCol = String(cols.obligatorio_col ?? '').trim();
    const vigenciaCol = String(cols.vigencia_col ?? '').trim();
    const permiteVencimientoCol = String(cols.permite_col ?? '').trim();

    if (!idCol || !nombreCol) {
      throw new BadRequestException(
        'No se pudieron identificar columnas de Tipos_documentos (id/nombre)',
      );
    }

    const whereEstado = estadoCol
      ? `WHERE (TRY_CONVERT(BIT, [${estadoCol}]) = 1 OR UPPER(LTRIM(RTRIM(CAST([${estadoCol}] AS NVARCHAR(20))))) IN ('TRUE', 'ACTIVO', 'A', 'SI', 'S'))`
      : '';

    if (mode === 'full') {
      const obligatorioExpr = obligatorioCol
        ? `TRY_CONVERT(BIT, [${obligatorioCol}])`
        : 'CAST(0 AS BIT)';
      const vigenciaExpr = vigenciaCol
        ? `TRY_CONVERT(INT, [${vigenciaCol}])`
        : 'NULL';
      const permiteExpr = permiteVencimientoCol
        ? `TRY_CONVERT(BIT, [${permiteVencimientoCol}])`
        : `CASE WHEN ${vigenciaExpr} IS NULL THEN CAST(0 AS BIT) ELSE CAST(1 AS BIT) END`;

      const fullResult = await this.dataSource.query(`
        SELECT
          TRY_CONVERT(INT, [${idCol}]) AS tdo_id,
          CAST([${nombreCol}] AS NVARCHAR(255)) AS tdo_nombre,
          ${descripcionCol ? `CAST([${descripcionCol}] AS NVARCHAR(500))` : 'NULL'} AS tdo_descripcion,
          ${obligatorioExpr} AS tdo_obligatorio,
          ${vigenciaExpr} AS tdo_vigencia_dias,
          ${permiteExpr} AS tdo_permite_vencimiento,
          ${estadoCol ? `TRY_CONVERT(BIT, [${estadoCol}])` : 'CAST(1 AS BIT)'} AS tdo_estado
        FROM dbo.Tipos_documentos
        ${whereEstado}
        ORDER BY [${nombreCol}]
      `);

      return fullResult
        .filter((row: any) => row.tdo_id !== null && row.tdo_nombre !== null)
        .map((row: any) => ({
          tdo_id: Number(row.tdo_id),
          tdo_nombre: String(row.tdo_nombre),
          tdo_descripcion:
            row.tdo_descripcion === null ? null : String(row.tdo_descripcion),
          tdo_obligatorio: Boolean(row.tdo_obligatorio),
          tdo_vigencia_dias:
            row.tdo_vigencia_dias === null
              ? null
              : Number(row.tdo_vigencia_dias),
          tdo_permite_vencimiento: Boolean(row.tdo_permite_vencimiento),
          tdo_estado: Boolean(row.tdo_estado),
        }));
    }

    const result = await this.dataSource.query(`
      SELECT
        TRY_CONVERT(INT, [${idCol}]) AS op_id,
        CAST([${nombreCol}] AS NVARCHAR(255)) AS op_descripcion
      FROM dbo.Tipos_documentos
      ${whereEstado}
      ORDER BY [${nombreCol}]
    `);

    return result
      .filter((row: any) => row.op_id !== null && row.op_descripcion !== null)
      .map((row: any) => ({
        op_id: Number(row.op_id),
        op_descripcion: String(row.op_descripcion),
      }));
  }

  async getCatalogoEsquema(
    mode: 'databases' | 'tables' | 'columns',
    baseDatos?: string,
    tabla?: string,
    q?: string,
  ) {
    const query = (q || '').trim();

    if (!['databases', 'tables', 'columns'].includes(mode)) {
      throw new BadRequestException('Modo inválido');
    }

    if (baseDatos && !this.isSafeIdentifier(baseDatos)) {
      throw new BadRequestException('Nombre de base de datos inválido');
    }

    if (tabla && !this.isSafeIdentifier(tabla)) {
      throw new BadRequestException('Nombre de tabla inválido');
    }

    if (mode === 'databases') {
      const result = await this.dataSource.query(
        `
        SELECT name
        FROM sys.databases
        WHERE state = 0
          AND (@0 = '' OR name LIKE '%' + @0 + '%')
        ORDER BY name
      `,
        [query],
      );

      return result.map((row: any) => String(row.name));
    }

    const currentDbResult = await this.dataSource.query(
      `SELECT DB_NAME() AS db_name`,
    );
    const currentDb = String(currentDbResult?.[0]?.db_name ?? '').trim();
    const targetDb = baseDatos || currentDb;

    if (!targetDb || !this.isSafeIdentifier(targetDb)) {
      throw new BadRequestException('Base de datos objetivo inválida');
    }

    if (mode === 'tables') {
      const result = await this.dataSource.query(
        `
        SELECT TABLE_NAME
        FROM [${targetDb}].INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
          AND TABLE_SCHEMA = 'dbo'
          AND (@0 = '' OR TABLE_NAME LIKE '%' + @0 + '%')
        ORDER BY TABLE_NAME
      `,
        [query],
      );

      return result.map((row: any) => String(row.TABLE_NAME));
    }

    if (!tabla) {
      throw new BadRequestException(
        'El parámetro tabla es requerido para consultar columnas',
      );
    }

    const result = await this.dataSource.query(
      `
      SELECT COLUMN_NAME
      FROM [${targetDb}].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = @0
        AND (@1 = '' OR COLUMN_NAME LIKE '%' + @1 + '%')
      ORDER BY ORDINAL_POSITION
    `,
      [tabla, query],
    );

    return result.map((row: any) => String(row.COLUMN_NAME));
  }
}
