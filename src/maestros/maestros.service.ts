import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TABLAS, COLUMNAS } from '../common/constants/tablas.constants';

interface ColumnInfo {
  name: string;
  dataType: string;
}

// Una combinación tabla/columnas que el formulario tiene configurada como
// catálogo — única forma legítima de consultar /maestros/catalogo.
interface CatalogoPermitido {
  baseDatos: string;
  tabla: string;
  columna: string;
  pk: string;
  filtro: string;
  condicion: string;
}

// Límite de filas por catálogo: evita que una tabla grande tumbe el proceso.
const MAX_FILAS_CATALOGO = 5000;

// Defensa extra por si alguien configura mal un catálogo: nunca devolver
// columnas de credenciales aunque estén en la lista permitida.
const COLUMNA_SENSIBLE = /pass|token|hash|secret|clave/i;

@Injectable()
export class MaestrosService {
  constructor(private readonly dataSource: DataSource) {}

  private catalogosPermitidosCache:
    | { expira: number; items: CatalogoPermitido[] }
    | undefined;

  private isSafeIdentifier(value: string): boolean {
    return /^[A-Za-z0-9_]+$/.test(value);
  }

  // Lista permitida = lo configurado en Formulario_pregunta (fp_catalogo_*)
  // + las columnas tipo CATALOGO dentro de preguntas TABLA
  // (fp_tabla_columnas). Antes /maestros/catalogo aceptaba CUALQUIER tabla
  // y columna de CUALQUIER base del servidor: un cliente logueado podía
  // leer usuarios.usr_password. Cache corto (60s) para que un catálogo
  // recién configurado en el editor quede disponible casi de inmediato.
  private async getCatalogosPermitidos(): Promise<CatalogoPermitido[]> {
    const ahora = Date.now();
    if (this.catalogosPermitidosCache && this.catalogosPermitidosCache.expira > ahora) {
      return this.catalogosPermitidosCache.items;
    }

    const norm = (v: unknown) =>
      (typeof v === 'string' ? v : '').trim().toLowerCase();
    const items: CatalogoPermitido[] = [];

    const preguntas = await this.dataSource.query(`
      SELECT fp_catalogo_base_datos, fp_catalogo_tabla, fp_catalogo_columna,
             fp_catalogo_pk_column, fp_catalogo_filtro_columna,
             fp_catalogo_columna_condicion
      FROM Formulario_pregunta
      WHERE fp_catalogo_tabla IS NOT NULL AND LTRIM(RTRIM(fp_catalogo_tabla)) <> ''
    `);
    for (const p of preguntas) {
      items.push({
        baseDatos: norm(p.fp_catalogo_base_datos),
        tabla: norm(p.fp_catalogo_tabla),
        columna: norm(p.fp_catalogo_columna),
        pk: norm(p.fp_catalogo_pk_column),
        filtro: norm(p.fp_catalogo_filtro_columna),
        condicion: norm(p.fp_catalogo_columna_condicion),
      });
    }

    const tablas = await this.dataSource.query(`
      SELECT fp_tabla_columnas
      FROM Formulario_pregunta
      WHERE fp_tabla_columnas LIKE '%catalogo_tabla%'
    `);
    for (const t of tablas) {
      let columnas: any[] = [];
      try {
        columnas = JSON.parse(t.fp_tabla_columnas);
      } catch {
        continue;
      }
      if (!Array.isArray(columnas)) continue;
      for (const c of columnas) {
        if (!c?.catalogo_tabla) continue;
        items.push({
          baseDatos: norm(c.catalogo_base_datos),
          tabla: norm(c.catalogo_tabla),
          columna: norm(c.catalogo_columna),
          pk: norm(c.catalogo_pk_column),
          filtro: norm(c.catalogo_columna_filtro),
          condicion: norm(c.catalogo_columna_condicion),
        });
      }
    }

    this.catalogosPermitidosCache = { expira: ahora + 60_000, items };
    return items;
  }

  // Cada parámetro pedido debe coincidir con lo configurado (o venir vacío
  // y dejar que se adivine, igual que antes, pero siempre dentro de una
  // tabla permitida).
  private async verificarCatalogoPermitido(pedido: {
    baseDatos?: string;
    tabla: string;
    columna?: string;
    pk?: string;
    filtro?: string;
    condicion?: string;
  }) {
    for (const col of [pedido.columna, pedido.pk, pedido.filtro, pedido.condicion]) {
      if (col && COLUMNA_SENSIBLE.test(col)) {
        throw new ForbiddenException('Catálogo no permitido');
      }
    }

    const norm = (v?: string) => String(v ?? '').trim().toLowerCase();
    const coincide = (pedidoValor: string | undefined, configurado: string) =>
      !norm(pedidoValor) || norm(pedidoValor) === configurado;

    const permitidos = await this.getCatalogosPermitidos();
    const ok = permitidos.some(
      (p) =>
        p.tabla === norm(pedido.tabla) &&
        p.baseDatos === norm(pedido.baseDatos) &&
        coincide(pedido.columna, p.columna) &&
        coincide(pedido.pk, p.pk) &&
        coincide(pedido.filtro, p.filtro) &&
        coincide(pedido.condicion, p.condicion),
    );
    if (!ok) {
      throw new ForbiddenException('Catálogo no permitido');
    }
  }

  // Condición "fila activa" tolerante al tipo de columna (BIT, 1/0, 'A',
  // 'ACTIVO', 'S'...). El camino general usaba `= 1` a secas y reventaba
  // con 500 si la columna de estado era texto.
  private condicionActivo(columna: string): string {
    return `(TRY_CONVERT(BIT, [${columna}]) = 1 OR UPPER(LTRIM(RTRIM(CAST([${columna}] AS NVARCHAR(20))))) IN ('TRUE', 'ACTIVO', 'A', 'SI', 'S'))`;
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // Nombre de la base a la que está conectado el proceso: no cambia mientras
  // el proceso vive. Antes se consultaba (SELECT DB_NAME()) en cada llamada
  // a /maestros/catalogo — un viaje de ~0.3 s a la BD remota por catálogo.
  private nombreBaseActual: string | undefined;

  private async obtenerNombreBaseActual(): Promise<string> {
    if (this.nombreBaseActual === undefined) {
      const result = await this.dataSource.query(`SELECT DB_NAME() AS db_name`);
      this.nombreBaseActual = String(result?.[0]?.db_name ?? '').trim();
    }
    return this.nombreBaseActual;
  }

  // Columna de estado por tabla: sale de INFORMATION_SCHEMA, que solo
  // cambia al alterar el esquema. Cache de 10 min (mismo motivo que arriba).
  private columnaEstadoCache = new Map<
    string,
    { valor: string | null; expira: number }
  >();

  private async detectarColumnaEstado(
    targetDb: string,
    tabla: string,
  ): Promise<string | null> {
    const clave = `${targetDb}.${tabla}`.toLowerCase();
    const enCache = this.columnaEstadoCache.get(clave);
    if (enCache && enCache.expira > Date.now()) return enCache.valor;

    const valor = await this.consultarColumnaEstado(targetDb, tabla);
    this.columnaEstadoCache.set(clave, {
      valor,
      expira: Date.now() + 10 * 60_000,
    });
    return valor;
  }

  // Busca una columna tipo "ciu_estado"/"pai_activo"/"estado" en la tabla
  // sin traer todo INFORMATION_SCHEMA — un solo query liviano, priorizando
  // nombres que terminen en "_estado" (convención real de este esquema)
  // sobre "_activo" (nunca se usa, pero por si acaso).
  private async consultarColumnaEstado(
    targetDb: string,
    tabla: string,
  ): Promise<string | null> {
    const rows = await this.dataSource.query(
      `
      SELECT COLUMN_NAME
      FROM [${targetDb}].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @0
        -- Solo "estado"/"activo" o terminadas en "_estado"/"_activo": antes
        -- '%estado%' podía tomar p.ej. "estado_civil" y filtrar mal.
        AND (LOWER(COLUMN_NAME) IN ('estado', 'activo')
             OR LOWER(COLUMN_NAME) LIKE '%[_]estado'
             OR LOWER(COLUMN_NAME) LIKE '%[_]activo')
      ORDER BY CASE WHEN LOWER(COLUMN_NAME) LIKE '%estado' THEN 0 ELSE 1 END
      `,
      [tabla],
    );
    return rows?.[0]?.COLUMN_NAME ? String(rows[0].COLUMN_NAME) : null;
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
    columnas: {
      id: string;
      nombre: string;
      parentId?: string;
      estado: string;
    };
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
    columnaId?: string,
    columnaFiltro?: string,
    valorFiltro?: string,
    columnaCondicion?: string,
    valorCondicion?: string,
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

    if (columnaId && !this.isSafeIdentifier(columnaId)) {
      throw new BadRequestException('Nombre de columna llave inválido');
    }

    if (columnaFiltro && !this.isSafeIdentifier(columnaFiltro)) {
      throw new BadRequestException('Nombre de columna de filtro inválido');
    }

    if (columnaFiltro && !valorFiltro) {
      throw new BadRequestException(
        'valor_filtro es requerido cuando se indica columna_filtro',
      );
    }

    if (columnaCondicion && !this.isSafeIdentifier(columnaCondicion)) {
      throw new BadRequestException('Nombre de columna de condición inválido');
    }

    if (columnaCondicion && !valorCondicion) {
      throw new BadRequestException(
        'valor_condicion es requerido cuando se indica columna_condicion',
      );
    }

    await this.verificarCatalogoPermitido({
      baseDatos,
      tabla,
      columna: columnaDescripcion,
      pk: columnaId,
      filtro: columnaFiltro,
      condicion: columnaCondicion,
    });

    const currentDb = await this.obtenerNombreBaseActual();
    const targetDb = baseDatos || currentDb;

    // Si ya nos dan columna de valor Y columna llave explícitas, no hace
    // falta consultar INFORMATION_SCHEMA completo para adivinarlas (nos
    // ahorramos esa ida y vuelta) — pero sí filtramos para no traer
    // catálogos con filas dadas de baja (ej. Ciudads tiene ciu_id duplicados
    // donde el viejo quedó con ciu_estado='I' al crear el nuevo).
    // `columnaCondicion`/`valorCondicion` (configurados desde el editor de
    // preguntas, fp_catalogo_columna_condicion/fp_catalogo_valor_condicion o
    // su equivalente por columna dentro de una TABLA) son una condición
    // estática explícita — cualquier "columna = valor", no solo
    // activo/inactivo — y tienen prioridad total sobre adivinar por
    // convención de nombre cuando se configuran. Si no se configuran, cae al
    // comportamiento de siempre: adivinar la columna de estado por nombre y
    // aceptar los valores típicos de "activo" — ver
    // documentacion/Problemas serios/tipo_de_pregunta.md, problema 2.
    if (columnaDescripcion && columnaId) {
      const condicionesDirecto: string[] = [];
      const paramsDirecto: any[] = [];

      if (columnaCondicion && valorCondicion) {
        condicionesDirecto.push(
          `UPPER(LTRIM(RTRIM(CAST([${columnaCondicion}] AS NVARCHAR(255))))) = UPPER(@${paramsDirecto.length})`,
        );
        paramsDirecto.push(valorCondicion);
      } else {
        const estadoCol = await this.detectarColumnaEstado(targetDb, tabla);
        if (estadoCol) {
          condicionesDirecto.push(this.condicionActivo(estadoCol));
        }
      }
      if (columnaFiltro) {
        condicionesDirecto.push(`[${columnaFiltro}] = @${paramsDirecto.length}`);
        paramsDirecto.push(valorFiltro);
      }
      const whereFiltroDirecto =
        condicionesDirecto.length > 0
          ? `WHERE ${condicionesDirecto.join(' AND ')}`
          : '';

      const dataQueryDirecta = `
        SELECT TOP ${MAX_FILAS_CATALOGO}
          TRY_CONVERT(INT, [${columnaId}]) AS op_id,
          CAST([${columnaDescripcion}] AS NVARCHAR(255)) AS op_descripcion
        FROM [${targetDb}].[dbo].[${tabla}]
        ${whereFiltroDirecto}
        ORDER BY [${columnaDescripcion}]
      `;
      const dataResultDirecto = await this.dataSource.query(
        dataQueryDirecta,
        paramsDirecto,
      );
      return dataResultDirecto
        .filter((row: any) => row.op_id !== null && row.op_descripcion !== null)
        .map((row: any) => ({
          op_id: Number(row.op_id),
          op_descripcion: String(row.op_descripcion),
        }));
    }

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

    let effectiveIdColumn = idColumn;
    if (columnaId) {
      const existsSelectedId = columns.some(
        (column) => this.normalize(column.name) === this.normalize(columnaId),
      );
      if (!existsSelectedId) {
        throw new BadRequestException(
          `La columna ${columnaId} no existe en la tabla ${tabla}`,
        );
      }
      effectiveIdColumn =
        columns.find(
          (column) => this.normalize(column.name) === this.normalize(columnaId),
        )?.name ?? columnaId;
    }

    if (!effectiveIdColumn || !effectiveLabelColumn) {
      throw new BadRequestException(
        'No fue posible identificar columnas id/nombre para el catálogo. Verifica la estructura de la tabla.',
      );
    }

    const condiciones: string[] = [];
    const paramsGeneral: any[] = [];
    if (columnaCondicion && valorCondicion) {
      condiciones.push(
        `UPPER(LTRIM(RTRIM(CAST([${columnaCondicion}] AS NVARCHAR(255))))) = UPPER(@${paramsGeneral.length})`,
      );
      paramsGeneral.push(valorCondicion);
    } else if (activeColumn) {
      condiciones.push(this.condicionActivo(activeColumn));
    }
    if (columnaFiltro) {
      condiciones.push(`[${columnaFiltro}] = @${paramsGeneral.length}`);
      paramsGeneral.push(valorFiltro);
    }
    const whereClause =
      condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const dataQuery = `
      SELECT TOP ${MAX_FILAS_CATALOGO}
        TRY_CONVERT(INT, [${effectiveIdColumn}]) AS op_id,
        CAST([${effectiveLabelColumn}] AS NVARCHAR(255)) AS op_descripcion
      FROM [${targetDb}].[dbo].[${tabla}]
      ${whereClause}
      ORDER BY [${effectiveLabelColumn}]
    `;

    const dataResult = await this.dataSource.query(dataQuery, paramsGeneral);

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

    const currentDb = await this.obtenerNombreBaseActual();
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
