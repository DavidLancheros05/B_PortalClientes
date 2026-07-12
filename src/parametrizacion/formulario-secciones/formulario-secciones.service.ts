import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface Seccion {
  fs_id: number;
  fs_nombre: string;
  fs_descripcion: string | null;
  fs_orden: number;
  fs_activo: boolean;
  fs_oculta_en_formulario: boolean;
}

@Injectable()
export class FormularioSeccionesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(): Promise<Seccion[]> {
    const result = await this.dataSource.query(
      `
      SELECT
        fs_id,
        fs_nombre,
        fs_descripcion,
        fs_orden,
        fs_activo,
        fs_oculta_en_formulario
      FROM Formulario_secciones
      ORDER BY fs_orden ASC
    `,
    );
    return result;
  }

  async crear(data: {
    seccion_nombre: string;
    seccion_descripcion?: string;
    seccion_orden: number;
    seccion_oculta_en_formulario?: boolean;
  }): Promise<Seccion> {
    const result = await this.dataSource.query(
      `
      INSERT INTO Formulario_secciones (
        fs_nombre,
        fs_descripcion,
        fs_orden,
        fs_activo,
        fs_oculta_en_formulario
      )
      OUTPUT
        INSERTED.fs_id,
        INSERTED.fs_nombre,
        INSERTED.fs_descripcion,
        INSERTED.fs_orden,
        INSERTED.fs_activo,
        INSERTED.fs_oculta_en_formulario
      VALUES (@0, @1, @2, 1, @3)
    `,
      [
        data.seccion_nombre,
        data.seccion_descripcion || null,
        data.seccion_orden,
        data.seccion_oculta_en_formulario ? 1 : 0,
      ],
    );
    return result[0];
  }

  async actualizar(
    id: number,
    data: {
      seccion_nombre?: string;
      seccion_descripcion?: string;
      seccion_orden?: number;
      seccion_activo?: boolean;
      seccion_oculta_en_formulario?: boolean;
    },
  ): Promise<Seccion> {
    let query = 'UPDATE Formulario_secciones SET ';
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 0;

    if (data.seccion_nombre !== undefined) {
      updates.push(`fs_nombre = @${paramIndex}`);
      params.push(data.seccion_nombre);
      paramIndex++;
    }
    if (data.seccion_descripcion !== undefined) {
      updates.push(`fs_descripcion = @${paramIndex}`);
      params.push(data.seccion_descripcion || null);
      paramIndex++;
    }
    if (data.seccion_orden !== undefined) {
      updates.push(`fs_orden = @${paramIndex}`);
      params.push(data.seccion_orden);
      paramIndex++;
    }
    if (data.seccion_activo !== undefined) {
      updates.push(`fs_activo = @${paramIndex}`);
      params.push(data.seccion_activo ? 1 : 0);
      paramIndex++;
    }
    if (data.seccion_oculta_en_formulario !== undefined) {
      updates.push(`fs_oculta_en_formulario = @${paramIndex}`);
      params.push(data.seccion_oculta_en_formulario ? 1 : 0);
      paramIndex++;
    }

    query += updates.join(', ');
    query += ` OUTPUT INSERTED.* WHERE fs_id = @${paramIndex}`;
    params.push(id);

    const result = await this.dataSource.query(query, params);
    return result[0];
  }

  async eliminar(id: number): Promise<boolean> {
    const result = await this.dataSource.query(
      `DELETE FROM Formulario_secciones WHERE fs_id = @0`,
      [id],
    );
    return result.rowsAffected > 0;
  }
}
