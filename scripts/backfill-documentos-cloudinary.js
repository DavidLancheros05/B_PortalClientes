/**
 * Uso único: migra a Cloudinary los documentos que ya estaban guardados en
 * disco local antes de este cambio (Solicitud_archivo.sa_ruta_almacenamiento
 * apuntando a una ruta local en vez de una URL http(s)).
 *
 * Debe correr en un entorno donde el disco original sea accesible (p.ej. el
 * Shell/Job del servicio en Render), con el mismo working directory desde
 * el que corría el backend (para que las rutas relativas a
 * Documentos-Solicitudes/ existan).
 *
 * Reanudable: salta cualquier fila cuyo sa_ruta_almacenamiento ya empiece con
 * "http" (ya migrada). Si un archivo individual falla (p.ej. ya no existe
 * en disco), se reporta y se continúa con el resto.
 *
 * Uso: node scripts/backfill-documentos-cloudinary.js
 */
require('dotenv').config();
const sql = require('mssql');
const { readFile } = require('fs/promises');
const { v2: cloudinary } = require('cloudinary');

const dbConfig = {
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true },
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function subirArchivo(rutaLocal, folder, filename, mimetype) {
  const buffer = await readFile(rutaLocal);
  const dataUri = `data:${mimetype || 'application/octet-stream'};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: 'auto',
    use_filename: true,
    unique_filename: true,
    filename_override: filename,
  });
  return result;
}

async function run() {
  const pool = await sql.connect(dbConfig);

  const pendientes = await pool.request().query(`
    SELECT sa.sa_id, sa.sa_sol_id, sa.sa_nombre_original, sa.sa_nombre_guardado,
           sa.sa_tipo_mime, sa.sa_ruta_almacenamiento,
           s.sol_numero_solicitud, co.cop_nombre,
           sa.sa_fp_id
    FROM Solicitud_archivo sa
    INNER JOIN solicitudes s ON sa.sa_sol_id = s.sol_id
    INNER JOIN Centro_operacion co ON s.sol_co_id = co.cop_id
    WHERE sa.sa_estado = 'activo'
      AND sa.sa_ruta_almacenamiento NOT LIKE 'http%'
    ORDER BY sa.sa_id
  `);

  const filas = pendientes.recordset;
  console.log(`Encontrados ${filas.length} archivos por migrar.`);

  let ok = 0;
  let fallidos = 0;

  for (const fila of filas) {
    const {
      sa_id,
      sa_sol_id,
      sa_nombre_original,
      sa_nombre_guardado,
      sa_tipo_mime,
      sa_ruta_almacenamiento,
      sol_numero_solicitud,
      cop_nombre,
    } = fila;

    try {
      const folder = `documentos-solicitudes/${cop_nombre}/formularios/${sol_numero_solicitud}`;
      const subida = await subirArchivo(
        sa_ruta_almacenamiento,
        folder,
        sa_nombre_guardado,
        sa_tipo_mime,
      );

      await pool
        .request()
        .input('sa_id', sql.Int, sa_id)
        .input('url', sql.NVarChar, subida.secure_url)
        .input('publicId', sql.NVarChar, subida.public_id)
        .input('resourceType', sql.NVarChar, subida.resource_type).query(`
          UPDATE Solicitud_archivo
          SET sa_ruta_almacenamiento = @url,
              sa_cloudinary_public_id = @publicId,
              sa_resource_type = @resourceType
          WHERE sa_id = @sa_id
        `);

      // Solicitud_documento guarda una copia de la misma ruta local en
      // sd_ruta_archivo (insertada junto con Solicitud_archivo) — se
      // actualiza en paralelo para que apunte a la misma URL nueva.
      await pool
        .request()
        .input('rutaVieja', sql.NVarChar, sa_ruta_almacenamiento)
        .input('url', sql.NVarChar, subida.secure_url)
        .input('solicitudId', sql.Int, sa_sol_id).query(`
          UPDATE Solicitud_documento
          SET sd_ruta_archivo = @url
          WHERE sd_solicitud_id = @solicitudId AND sd_ruta_archivo = @rutaVieja
        `);

      console.log(
        `✅ sa_id=${sa_id} (${sa_nombre_original}) → ${subida.secure_url}`,
      );
      ok++;
    } catch (error) {
      console.error(
        `❌ sa_id=${sa_id} (${sa_nombre_original}):`,
        error.message,
      );
      fallidos++;
    }
  }

  console.log(`\nListo. Migrados: ${ok}. Fallidos: ${fallidos}.`);
  await pool.close();
}

run().catch((err) => {
  console.error('Error general del backfill:', err);
  process.exit(1);
});
