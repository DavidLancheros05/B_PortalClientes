import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async resolveUserColumnsFromSistemaComercial() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('usuarios','usr_id') IS NOT NULL THEN 'usr_id' ELSE 'usr_id' END AS id_col,
        CASE WHEN COL_LENGTH('usuarios','usr_nombre') IS NOT NULL THEN 'usr_nombre' ELSE 'nombre' END AS nombre_col,
        CASE WHEN COL_LENGTH('usuarios','usr_email') IS NOT NULL THEN 'usr_email' ELSE 'usuario_email' END AS email_col,
        CASE WHEN COL_LENGTH('usuarios','usr_password') IS NOT NULL THEN 'usr_password' ELSE 'usuario_password' END AS pass_col,
        CASE WHEN COL_LENGTH('usuarios','usr_rol_id') IS NOT NULL THEN 'usr_rol_id' ELSE 'usuario_rol_id' END AS rol_col,
        CASE WHEN COL_LENGTH('usuarios','usr_activo') IS NOT NULL THEN 'usr_activo' ELSE 'usuario_activo' END AS activo_col
    `);

    return result[0];
  }

  private async resolveClientColumnsFromSistemaComercial() {
    const result = await this.dataSource.query(`
      SELECT
        CASE WHEN COL_LENGTH('clientes','cli_id') IS NOT NULL THEN 'cli_id' ELSE 'cliente_id' END AS id_col,
        CASE WHEN COL_LENGTH('clientes','cli_acceso_portal_clientes') IS NOT NULL THEN 'cli_acceso_portal_clientes' ELSE 'cliente_acceso_portal' END AS habilita_col,
        CASE WHEN COL_LENGTH('clientes','cli_es_zona_franca') IS NOT NULL THEN 'cli_es_zona_franca' ELSE 'cliente_es_zona_franca' END AS zona_col,
        CASE WHEN COL_LENGTH('clientes','cli_usr_id') IS NOT NULL THEN 'cli_usr_id' ELSE 'usr_id' END AS usuario_col,
        CASE WHEN COL_LENGTH('clientes','cli_razon_social') IS NOT NULL THEN 'cli_razon_social' ELSE 'cliente_razon_social' END AS razon_col,
        CASE WHEN COL_LENGTH('clientes','cli_nro_identificacion') IS NOT NULL THEN 'cli_nro_identificacion' ELSE 'cliente_nit_documento' END AS nit_col,
        CASE WHEN COL_LENGTH('clientes','cli_direccion') IS NOT NULL THEN 'cli_direccion' ELSE 'cliente_direccion' END AS direccion_col,
        CASE WHEN COL_LENGTH('clientes','cli_telefono') IS NOT NULL THEN 'cli_telefono' ELSE 'cliente_telefono' END AS telefono_col,
        CASE WHEN COL_LENGTH('clientes','cli_created_at') IS NOT NULL THEN 'cli_created_at' ELSE 'cliente_created_at' END AS created_col
    `);

    return result[0];
  }

  async getUserByEmail(email: string) {
    const userCols = await this.resolveUserColumnsFromSistemaComercial();
    const clientCols = await this.resolveClientColumnsFromSistemaComercial();

    const usuario = await this.dataSource.query(
      `
  SELECT u.${userCols.id_col} AS usr_id,
         u.${userCols.nombre_col} AS nombre,
         u.${userCols.email_col} AS usuario_email,
         u.${userCols.pass_col} AS usuario_password_hash,
         u.${userCols.activo_col} AS usuario_activo,
         r.rol_id,
         r.rol_nombre,
         r.rol_codigo,
         c.${clientCols.id_col} AS cliente_id,
         c.${clientCols.habilita_col} AS cliente_habilita_acceso
  FROM usuarios u
  INNER JOIN roles r ON u.${userCols.rol_col} = r.rol_id
  LEFT JOIN clientes c ON u.${userCols.id_col} = c.${clientCols.usuario_col}
  WHERE u.${userCols.email_col} = @0
  `,
      [email],
    );

    return usuario[0];
  }

  async getUserCentrosOperacion(usr_id: number) {
    const centrosResult = await this.dataSource.query(
      `
      SELECT
        uco.uco_id,
        uco.uco_co_id AS co_id,
        c.cop_nombre AS nombre,
        c.cop_estado AS activo,
        uco.uco_es_default AS es_default
      FROM usuarios_centros_operacion uco
      INNER JOIN Centro_operacion c ON uco.uco_co_id = c.cop_id
      WHERE uco.uco_usr_id = @0
      ORDER BY uco.uco_es_default DESC, uco.uco_id ASC
      `,
      [usr_id],
    );

    return centrosResult.map((row: any) => ({
      co_id: row.co_id,
      nombre: row.nombre,
      activo: row.activo,
      es_default: Boolean(row.es_default),
    }));
  }

  async assignOrCreateClientForAdmin(usr_id: number): Promise<number | null> {
    const clientCols = await this.resolveClientColumnsFromSistemaComercial();

    const clienteAsignable = await this.dataSource.query(
      `
      SELECT TOP 1 c.${clientCols.id_col} AS cliente_id
      FROM clientes c
      WHERE c.${clientCols.habilita_col} = 1
        AND (c.${clientCols.usuario_col} IS NULL OR c.${clientCols.usuario_col} = @0)
      ORDER BY
        CASE WHEN c.${clientCols.usuario_col} = @0 THEN 0 ELSE 1 END,
        c.${clientCols.id_col}
      `,
      [usr_id],
    );

    if (clienteAsignable[0]?.cliente_id) {
      const cliente_id = Number(clienteAsignable[0].cliente_id);

      await this.dataSource.query(
        `
        UPDATE clientes
        SET ${clientCols.usuario_col} = @0
        WHERE ${clientCols.id_col} = @1
          AND (${clientCols.usuario_col} IS NULL OR ${clientCols.usuario_col} = @0)
        `,
        [usr_id, cliente_id],
      );

      return cliente_id;
    } else {
      const nitAdmin = `ADM-${usr_id}`;
      const razonSocialAdmin = `CLIENTE ADMINISTRACION ${usr_id}`;

      const creado = await this.dataSource.query(
        `
        INSERT INTO clientes (
          ${clientCols.razon_col},
          ${clientCols.nit_col},
          ${clientCols.direccion_col},
          ${clientCols.telefono_col},
          ${clientCols.habilita_col},
          ${clientCols.zona_col},
          ${clientCols.usuario_col},
          ${clientCols.created_col}
        )
        OUTPUT INSERTED.${clientCols.id_col} AS cliente_id
        VALUES (@0, @1, @2, @3, 1, 0, @4, GETDATE())
        `,
        [razonSocialAdmin, nitAdmin, 'NO REGISTRADA', '0000000000', usr_id],
      );

      return Number(creado?.[0]?.cliente_id ?? 0) || null;
    }
  }
}
