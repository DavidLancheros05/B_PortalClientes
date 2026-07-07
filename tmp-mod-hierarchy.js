// const sql = require('mssql');
// (async () => {
//   const config = {
//     user: process.env.DB_USER || 'sa',
//     password: process.env.DB_PASSWORD || '123456',
//     server: process.env.DB_SERVER || 'localhost',
//     database: process.env.DB_NAME || 'VinculacionComercial',
//     options: { encrypt: false, trustServerCertificate: true },
//   };
//   const pool = await sql.connect(config);
//   const colsR = await pool.request().query(`
//     SELECT
//       CASE WHEN COL_LENGTH('modulos','mod_id') IS NOT NULL THEN 'mod_id' ELSE 'mod_id' END AS id_col,
//       CASE WHEN COL_LENGTH('modulos','mod_nombre') IS NOT NULL THEN 'mod_nombre' ELSE 'mod_nombre' END AS nombre_col,
//       CASE WHEN COL_LENGTH('modulos','mod_ruta') IS NOT NULL THEN 'mod_ruta' ELSE 'mod_ruta' END AS ruta_col,
//       CASE WHEN COL_LENGTH('modulos','mod_padre_id') IS NOT NULL THEN 'mod_padre_id' ELSE 'mod_padre_id' END AS padre_col,
//       CASE WHEN COL_LENGTH('modulos','mod_estado') IS NOT NULL THEN 'mod_estado' ELSE 'mod_activo' END AS estado_col
//   `);
//   const c = colsR.recordset[0];
//   const q = `
//     SELECT ${c.id_col} AS id, ${c.nombre_col} AS nombre, ${c.ruta_col} AS ruta, ${c.padre_col} AS padre, ${c.estado_col} AS estado
//     FROM modulos
//     WHERE ${c.estado_col}=1
//     ORDER BY CASE WHEN ${c.padre_col} IS NULL THEN 0 ELSE 1 END, ${c.padre_col}, id
//   `;
//   const r = await pool.request().query(q);
//   console.log(JSON.stringify({ columns: c, rows: r.recordset }, null, 2));
//   await pool.close();
// })().catch((e) => {
//   console.error(e);
//   process.exit(1);
// });
