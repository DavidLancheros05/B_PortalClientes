import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TiposIdentificacionService {
  constructor(private readonly dataSource: DataSource) {}

  private async resolveTiposIdentificacionColumns() {
    const result = await this.dataSource.query(`
      SELECT
        CASE
          WHEN COL_LENGTH('tipos_identificacion', 'tid_codigo') IS NOT NULL THEN 'tid_codigo'
          ELSE 'codigo'
        END AS codigo_col,
        CASE
          WHEN COL_LENGTH('tipos_identificacion', 'tid_nombre') IS NOT NULL THEN 'tid_nombre'
          ELSE 'nombre'
        END AS nombre_col,
        CASE
          WHEN COL_LENGTH('tipos_identificacion', 'tid_activo') IS NOT NULL THEN 'tid_activo'
          ELSE 'activo'
        END AS activo_col
    `);

    const row = result?.[0] ?? {};
    return {
      codigo: String(row.codigo_col ?? 'codigo').trim(),
      nombre: String(row.nombre_col ?? 'nombre').trim(),
      activo: String(row.activo_col ?? 'activo').trim(),
    };
  }

  private normalizarMojibake(valor: unknown): string {
    const texto = String(valor ?? '');
    return texto
      .replace(/á/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/ó/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã/g, 'Á')
      .replace(/Ã‰/g, 'É')
      .replace(/Ã/g, 'Í')
      .replace(/Ã"/g, 'Ó')
      .replace(/Ãš/g, 'Ú')
      .replace(/Ã'/g, 'Ñ')
      .replace(/Ãa/g, 'ía')
      .replace(/ÃA/g, 'ÍA')
      .replace(/Â/g, '')
      .trim();
  }

  private normalizarNombrePorCodigo(codigo: string, nombre: string): string {
    const canonical: Record<string, string> = {
      NIT: 'NIT',
      CC: 'Cédula de ciudadanía',
      CE: 'Cédula de extranjería',
      PASAPORTE: 'Pasaporte',
      OTRO: 'Otro',
    };

    const key = String(codigo || '')
      .trim()
      .toUpperCase();
    return canonical[key] || nombre;
  }

  async getTiposIdentificacion() {
    const tableExistsResult = await this.dataSource.query(`
      SELECT CASE WHEN OBJECT_ID('dbo.tipos_identificacion', 'U') IS NOT NULL THEN 1 ELSE 0 END AS exists_flag
    `);

    const exists = Number(tableExistsResult?.[0]?.exists_flag ?? 0) === 1;
    if (!exists) {
      throw new Error(
        'Tabla tipos_identificacion no existe. Ejecuta script 38-crear-tabla-tipos-identificacion.sql',
      );
    }

    const columns = await this.resolveTiposIdentificacionColumns();

    const result = await this.dataSource.query(`
      SELECT
        tid_id AS id,
        ${columns.codigo} AS codigo,
        ${columns.nombre} AS nombre
      FROM dbo.tipos_identificacion
      WHERE ${columns.activo} = 1
      ORDER BY ${columns.nombre}
    `);

    return result.map((row: any) => ({
      id: Number(row.id),
      codigo: String(row.codigo ?? '').trim(),
      nombre: this.normalizarNombrePorCodigo(
        String(row.codigo ?? '').trim(),
        this.normalizarMojibake(row.nombre),
      ),
    }));
  }
}
