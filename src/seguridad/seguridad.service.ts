import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class SeguridadService {
  constructor(private readonly dataSource: DataSource) {}

  async getRoles() {
    const result = await this.dataSource.query(`
      SELECT *
      FROM pc_roles
      WHERE rol_activo = 1
      ORDER BY rol_id
    `);

    const roles = result;

    for (const rol of roles) {
      const allModulosResult = await this.dataSource.query(`
        SELECT
          m.mod_id AS mod_id,
          m.mod_nombre AS mod_nombre,
          m.mod_ruta AS mod_ruta,
          m.mod_icono AS mod_icono,
          m.mod_padre_id AS mod_padre_id,
          m.mod_posicion AS mod_posicion
        FROM pc_modulos m
        WHERE m.mod_estado = 1
        ORDER BY m.mod_posicion
      `);

      const rolesPermisosResult = await this.dataSource.query(
        `
          SELECT
            m.mod_id AS mod_id,
            rm.rm_ver, rm.rm_crear, rm.rm_editar, rm.rm_eliminar, rm.rm_aprobar
          FROM pc_rol_modulo rm
          INNER JOIN pc_modulos m ON m.mod_id = rm.rm_mod_id
          WHERE rm.rm_rol_id = @0 AND rm.rm_activo = 1
        `,
        [rol.rol_id],
      );

      const permisosMap: Record<number, any> = {};
      rolesPermisosResult.forEach((p: any) => {
        permisosMap[p.mod_id] = {
          ver: !!p.rm_ver,
          crear: !!p.rm_crear,
          editar: !!p.rm_editar,
          eliminar: !!p.rm_eliminar,
          aprobar: !!p.rm_aprobar,
        };
      });

      const map: Record<number, any> = {};
      allModulosResult.forEach((m: any) => {
        map[m.mod_id] = {
          mod_id: m.mod_id,
          mod_nombre: m.mod_nombre,
          mod_ruta: m.mod_ruta,
          mod_icono: m.mod_icono,
          mod_padre_id: m.mod_padre_id,
          permisos: permisosMap[m.mod_id] || {
            ver: false,
            crear: false,
            editar: false,
            eliminar: false,
            aprobar: false,
          },
          subModulos: [],
        };
      });

      const arbol: any[] = [];
      Object.values(map).forEach((mod) => {
        if (!mod.mod_padre_id) arbol.push(mod);
        else {
          const padre = map[mod.mod_padre_id];
          if (padre) padre.subModulos.push(mod);
        }
      });

      rol.modulos = arbol;
    }

    // El SELECT * trae columnas snake_case (rol_id, rol_nombre...) tal
    // como estan en pc_roles, pero el frontend espera camelCase.
    return roles.map((rol: any) => ({
      rolId: rol.rol_id,
      rolNombre: rol.rol_nombre,
      rolDescripcion: rol.rol_descripcion,
      rolCodigo: rol.rol_codigo,
      rolActivo: !!rol.rol_activo,
      rolCreatedAt: rol.rol_created_at,
      rolUpdatedAt: rol.rol_updated_at,
      modulos: rol.modulos,
    }));
  }

  async crearRol(data: any) {
    const nombre = data.rol_nombre ?? data.nombre;
    const descripcion = data.rol_descripcion ?? data.descripcion;

    const result = await this.dataSource.query(
      `
        INSERT INTO pc_roles (rol_nombre, rol_descripcion, rol_activo, rol_created_at)
        OUTPUT INSERTED.*
        VALUES (@0, @1, @2, SYSDATETIME())
      `,
      [nombre, descripcion || null, 1],
    );

    const rolCreado = result[0];

    const insertarPermisosCrear = async (modulos: any[], rolId: number) => {
      for (const mod of modulos) {
        await this.dataSource.query(
          `
            INSERT INTO pc_rol_modulo (rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at)
            VALUES (@0, @1, @2, @3, @4, @5, @6, @7, SYSDATETIME())
          `,
          [
            rolId,
            mod.mod_id,
            mod.permisos.ver ? 1 : 0,
            mod.permisos.crear ? 1 : 0,
            mod.permisos.editar ? 1 : 0,
            mod.permisos.eliminar ? 1 : 0,
            mod.permisos.aprobar ? 1 : 0,
            1,
          ],
        );

        if (mod.subModulos?.length) {
          await insertarPermisosCrear(mod.subModulos, rolId);
        }
      }
    };

    if (data.modulos?.length) {
      await insertarPermisosCrear(data.modulos, rolCreado.rol_id);
    }

    return { message: 'Rol creado correctamente', rol: rolCreado };
  }

  async actualizarRol(id: number, data: any) {
    await this.dataSource.query(
      `
        UPDATE pc_roles
        SET rol_nombre = @0,
            rol_descripcion = @1,
            rol_updated_at = SYSDATETIME()
        WHERE rol_id = @2
      `,
      [data.rol_nombre, data.rol_descripcion || null, id],
    );

    const enviados: number[] = [];
    const collectIds = (mods: any[]) => {
      mods.forEach((m) => {
        enviados.push(m.mod_id);
        if (m.subModulos?.length) collectIds(m.subModulos);
      });
    };
    if (data.modulos?.length) collectIds(data.modulos);

    if (enviados.length) {
      const list = enviados.join(',');
      await this.dataSource.query(
        `
          UPDATE pc_rol_modulo
          SET rm_activo = 0, updated_at = SYSDATETIME()
          WHERE rm_rol_id = @0 AND rm_mod_id NOT IN (${list})
        `,
        [id],
      );
    }

    const insertarPermisos = async (modulos: any[]) => {
      for (const mod of modulos) {
        const existe = await this.dataSource.query(
          `
            SELECT * FROM pc_rol_modulo
            WHERE rm_rol_id = @0 AND rm_mod_id = @1
          `,
          [id, mod.mod_id],
        );

        if (existe.length > 0) {
          await this.dataSource.query(
            `
              UPDATE pc_rol_modulo
              SET rm_ver = @0, rm_crear = @1, rm_editar = @2, rm_eliminar = @3, rm_aprobar = @4, rm_activo = 1, updated_at = SYSDATETIME()
              WHERE rm_rol_id = @5 AND rm_mod_id = @6
            `,
            [
              mod.permisos.ver ? 1 : 0,
              mod.permisos.crear ? 1 : 0,
              mod.permisos.editar ? 1 : 0,
              mod.permisos.eliminar ? 1 : 0,
              mod.permisos.aprobar ? 1 : 0,
              id,
              mod.mod_id,
            ],
          );
        } else {
          await this.dataSource.query(
            `
              INSERT INTO pc_rol_modulo (rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at)
              VALUES (@0, @1, @2, @3, @4, @5, @6, @7, SYSDATETIME())
            `,
            [
              id,
              mod.mod_id,
              mod.permisos.ver ? 1 : 0,
              mod.permisos.crear ? 1 : 0,
              mod.permisos.editar ? 1 : 0,
              mod.permisos.eliminar ? 1 : 0,
              mod.permisos.aprobar ? 1 : 0,
              1,
            ],
          );
        }

        if (mod.subModulos?.length) {
          await insertarPermisos(mod.subModulos);
        }
      }
    };

    if (data.modulos?.length) {
      await insertarPermisos(data.modulos);
    }

    return { message: 'Rol actualizado correctamente' };
  }

  async inactivarRol(id: number) {
    await this.dataSource.query(
      `
        UPDATE pc_roles
        SET rol_activo = 0, rol_updated_at = SYSDATETIME()
        WHERE rol_id = @0
      `,
      [id],
    );

    return { message: 'Rol inactivado' };
  }

  async getModulos() {
    const result = await this.dataSource.query(`
      SELECT
        mod_id,
        mod_nombre,
        mod_ruta,
        mod_icono,
        mod_padre_id,
        mod_posicion
      FROM pc_modulos
      WHERE mod_estado = 1
      ORDER BY mod_posicion
    `);

    const buildTree = (modulos: any[], parentId?: number): any[] => {
      return modulos
        .filter((m) =>
          parentId ? m.mod_padre_id === parentId : !m.mod_padre_id,
        )
        .map((m) => ({
          mod_id: m.mod_id,
          mod_nombre: m.mod_nombre,
          mod_ruta: m.mod_ruta,
          mod_icono: m.mod_icono,
          mod_padre_id: m.mod_padre_id,
          subModulos: buildTree(modulos, m.mod_id),
        }));
    };

    return buildTree(result);
  }
}
