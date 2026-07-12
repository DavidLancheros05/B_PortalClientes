const sql = require('mssql');

const config = {
  server: 'SQL8020.site4now.net',
  port: 1433,
  user: 'db_acbbd1_sistemacomercial_admin',
  password: '1954Pqmz.',
  options: { encrypt: true, trustServerCertificate: true },
  database: 'db_acbbd1_sistemacomercial',
};

(async () => {
  const pool = await sql.connect(config);

  const otros = await pool.request().query(`
    SELECT mod_id, mod_nombre, mod_ruta, mod_padre_id, mod_estado
    FROM pc_modulos
    WHERE mod_ruta LIKE '/parametrizacion%'
    ORDER BY mod_padre_id, mod_posicion
  `);
  console.log('--- todos los modulos /parametrizacion/* ---');
  console.log(JSON.stringify(otros.recordset, null, 2));

  const parametrizacionPadre = await pool.request().query(`
    SELECT mod_id, mod_nombre, mod_ruta, mod_padre_id
    FROM pc_modulos
    WHERE mod_nombre LIKE '%arametrizaci%'
  `);
  console.log('--- modulo(s) llamados Parametrizacion ---');
  console.log(JSON.stringify(parametrizacionPadre.recordset, null, 2));

  await pool.close();
})().catch((err) => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
