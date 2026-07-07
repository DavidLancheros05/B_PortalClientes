import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface CorreoPorRol {
  correo_id: number;
  rol_id: number;
  rol_nombre: string;
  rol_codigo: string;
  email: string;
  activo: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface RolBasico {
  rol_id: number;
  rol_nombre: string;
  rol_codigo: string;
}

@Injectable()
export class CorreosPorRolService {
  constructor(private readonly dataSource: DataSource) {}

  async getCorreosPorRol(): Promise<CorreoPorRol[]> {
    const result = await this.dataSource.query(`
      SELECT
        cpr.correo_id,
        cpr.rol_id,
        r.rol_nombre,
        r.rol_codigo,
        cpr.email,
        cpr.activo,
        cpr.created_at,
        cpr.updated_at
      FROM correos_por_rol cpr
      INNER JOIN roles r ON r.rol_id = cpr.rol_id
      ORDER BY r.rol_nombre
    `);

    return result;
  }

  async getRolesActivos(): Promise<RolBasico[]> {
    const result = await this.dataSource.query(`
      SELECT rol_id, rol_nombre, rol_codigo
      FROM roles
      WHERE rol_activo = 1
      ORDER BY rol_nombre
    `);

    return result;
  }

  async crearCorreoPorRol(data: { rol_id: number; email: string }) {
    const existe = await this.dataSource.query(
      `SELECT COUNT(1) AS total FROM correos_por_rol WHERE rol_id = @0`,
      [data.rol_id],
    );

    if (existe[0]?.total > 0) {
      throw new Error('Ya existe un correo para este rol');
    }

    const insertResult = await this.dataSource.query(
      `
        INSERT INTO correos_por_rol (rol_id, email, activo, created_at, updated_at)
        OUTPUT INSERTED.correo_id
        VALUES (@0, @1, 1, SYSDATETIME(), NULL)
      `,
      [data.rol_id, data.email],
    );

    const correoId = insertResult[0]?.correo_id;

    if (!correoId) {
      throw new Error('No se pudo crear el correo por rol');
    }

    const result = await this.dataSource.query(
      `
        SELECT
          cpr.correo_id,
          cpr.rol_id,
          r.rol_nombre,
          r.rol_codigo,
          cpr.email,
          cpr.activo,
          cpr.created_at,
          cpr.updated_at
        FROM correos_por_rol cpr
        INNER JOIN roles r ON r.rol_id = cpr.rol_id
        WHERE cpr.correo_id = @0
      `,
      [correoId],
    );

    return result[0];
  }

  async actualizarCorreoPorRol(correoId: number, data: { email: string }) {
    await this.dataSource.query(
      `
        UPDATE correos_por_rol
        SET email = @0, updated_at = SYSDATETIME()
        WHERE correo_id = @1
      `,
      [data.email, correoId],
    );

    return { success: true };
  }

  async actualizarEstadoCorreoPorRol(correoId: number, activo: boolean) {
    await this.dataSource.query(
      `
        UPDATE correos_por_rol
        SET activo = @0, updated_at = SYSDATETIME()
        WHERE correo_id = @1
      `,
      [activo ? 1 : 0, correoId],
    );

    return { success: true };
  }
}
