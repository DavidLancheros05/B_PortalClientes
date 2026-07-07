'use strict';
/**
 * MCP server local para SQL Server.
 * Usa el paquete mssql ya instalado en BACKEND/node_modules.
 * Ejecutado por Claude Code via .mcp.json en la raíz del proyecto.
 */
const sql = require('mssql');
const readline = require('readline');

const config = {
  server: process.env.DB_SERVER || 'localhost',
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'SistemaComercial',
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
};

let pool = null;

async function getPool() {
  if (!pool) pool = await sql.connect(config);
  return pool;
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const TOOLS = [
  {
    name: 'query',
    description: 'Ejecuta una consulta SQL (SELECT, INSERT, UPDATE, DELETE)',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Consulta SQL a ejecutar' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description: 'Lista todas las tablas de la base de datos con conteo de filas',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'describe_table',
    description: 'Devuelve columnas, tipos y constraints de una tabla',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Nombre de la tabla' },
      },
      required: ['table'],
    },
  },
  {
    name: 'list_columns',
    description: 'Lista columnas de todas las tablas que coincidan con un patrón',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Patrón LIKE para filtrar nombre de columna (ej: %_id%)' },
      },
      required: ['pattern'],
    },
  },
];

async function callTool(name, args) {
  const p = await getPool();

  if (name === 'query') {
    const result = await p.request().query(args.sql);
    const rows = result.recordset ?? result.recordsets?.[0] ?? [];
    const affected = result.rowsAffected?.[0];
    if (rows.length === 0 && affected != null) {
      return `Filas afectadas: ${affected}`;
    }
    return JSON.stringify(rows, null, 2);
  }

  if (name === 'list_tables') {
    const result = await p.request().query(`
      SELECT
        t.TABLE_SCHEMA AS esquema,
        t.TABLE_NAME   AS tabla,
        t.TABLE_TYPE   AS tipo,
        p.rows         AS filas
      FROM INFORMATION_SCHEMA.TABLES t
      LEFT JOIN sys.partitions p
        ON p.object_id = OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME)
        AND p.index_id IN (0,1)
      WHERE t.TABLE_CATALOG = DB_NAME()
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME
    `);
    return JSON.stringify(result.recordset, null, 2);
  }

  if (name === 'describe_table') {
    const req = p.request().input('table', sql.VarChar, args.table);
    const cols = await req.query(`
      SELECT
        c.COLUMN_NAME          AS columna,
        c.DATA_TYPE            AS tipo,
        c.CHARACTER_MAXIMUM_LENGTH AS largo,
        c.IS_NULLABLE          AS nulable,
        c.COLUMN_DEFAULT       AS defecto,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PK' ELSE '' END AS clave
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.TABLE_NAME = @table AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
      ) pk ON pk.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_NAME = @table
      ORDER BY c.ORDINAL_POSITION
    `);
    return JSON.stringify(cols.recordset, null, 2);
  }

  if (name === 'list_columns') {
    const req = p.request().input('pattern', sql.VarChar, args.pattern);
    const result = await req.query(`
      SELECT TABLE_NAME AS tabla, COLUMN_NAME AS columna, DATA_TYPE AS tipo
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE @pattern
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    return JSON.stringify(result.recordset, null, 2);
  }

  throw new Error(`Herramienta desconocida: ${name}`);
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  line = line.trim();
  if (!line) return;

  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { id, method, params } = msg;

  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mssql-portalclientescn', version: '1.0.0' },
        },
      });
    } else if (method === 'notifications/initialized' || method === 'initialized') {
      // notificación sin respuesta
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const text = await callTool(params.name, params.arguments || {});
      send({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text }] },
      });
    } else if (method === 'ping') {
      send({ jsonrpc: '2.0', id, result: {} });
    } else {
      send({
        jsonrpc: '2.0', id: id ?? null,
        error: { code: -32601, message: `Método no soportado: ${method}` },
      });
    }
  } catch (err) {
    send({
      jsonrpc: '2.0', id: id ?? null,
      error: { code: -32000, message: err.message },
    });
  }
});

process.on('uncaughtException', (err) => {
  process.stderr.write(`[mcp-mssql] Error: ${err.message}\n`);
});
