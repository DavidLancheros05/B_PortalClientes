import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface Permisos {
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  aprobar: boolean;
}

export interface MenuModulo {
  mod_id: number;
  mod_codigo: string;
  mod_nombre: string;
  mod_ruta: string | null;
  mod_icono: string | null;
  mod_orden: number;
  mod_padre_id: number | null;
  mod_activo: boolean;
  permisos: Permisos;
  subModulos: MenuModulo[];
}

@Injectable()
export class PermissionsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resuelve si un usuario tiene una acción habilitada (ver/crear/editar/
   * eliminar/aprobar) sobre un módulo, identificado por su ruta de menú
   * (`pc_modulos.mod_ruta`), consultando `pc_rol_modulo` en vez de comparar
   * nombres de rol quemados en el código.
   *
   * CLIENTE no vive en `pc_usuario_rol` (esa tabla es para `usuarios`
   * internos) — su rol_id se resuelve fijo vía `pc_roles`, igual que hace
   * `AuthService.loginCliente`. Un usuario interno puede tener varios roles
   * activos a la vez; se toman todos y basta con que UNO otorgue el permiso.
   *
   * Si la ruta tiene más de una fila en `pc_modulos` (dato sucio conocido,
   * ej. `/solicitudes` duplicada en mod_id 50/83), se prioriza
   * determinísticamente la fila raíz (`mod_padre_id IS NULL`) sobre
   * cualquier duplicado anidado, para que un duplicado nunca otorgue más
   * permiso del que dice la fila canónica.
   */
  async tienePermiso(
    user: { rol?: string; usr_id?: number },
    ruta: string,
    accion: keyof Permisos,
  ): Promise<boolean> {
    const rolIds = await this.resolverRolIds(user);
    if (rolIds.length === 0) {
      return false;
    }

    const columnaPorAccion: Record<keyof Permisos, string> = {
      ver: 'rm_ver',
      crear: 'rm_crear',
      editar: 'rm_editar',
      eliminar: 'rm_eliminar',
      aprobar: 'rm_aprobar',
    };
    const columna = columnaPorAccion[accion];

    const placeholders = rolIds.map((_, i) => `@${i + 1}`).join(', ');
    const rows = await this.dataSource.query(
      `
      SELECT rm.rm_rol_id, m.mod_id, m.mod_padre_id, rm.${columna} AS habilitado
      FROM pc_rol_modulo rm
      INNER JOIN pc_modulos m ON m.mod_id = rm.rm_mod_id
      WHERE m.mod_ruta = @0
        AND rm.rm_activo = 1
        AND rm.rm_rol_id IN (${placeholders})
      `,
      [ruta, ...rolIds],
    );

    const porRol = new Map<number, any>();
    for (const row of rows) {
      const rolId = Number(row.rm_rol_id);
      const actual = porRol.get(rolId);
      const esRaiz = row.mod_padre_id == null;
      // Prefiere la fila raíz; si ya había una raíz elegida, no la reemplaza.
      if (!actual || (esRaiz && actual.mod_padre_id != null)) {
        porRol.set(rolId, row);
      }
    }

    return Array.from(porRol.values()).some((row) => Boolean(row.habilitado));
  }

  private async resolverRolIds(user: {
    rol?: string;
    usr_id?: number;
  }): Promise<number[]> {
    if (user?.rol === 'CLIENTE') {
      const rows = await this.dataSource.query(
        `SELECT rol_id FROM pc_roles WHERE rol_codigo = 'CLIENTE'`,
      );
      return rows.map((r: any) => Number(r.rol_id));
    }

    if (user?.usr_id) {
      const rows = await this.dataSource.query(
        `SELECT DISTINCT ur_rol_id FROM pc_usuario_rol WHERE ur_usuario_id = @0 AND ur_activo = 1`,
        [user.usr_id],
      );
      if (rows.length > 0) {
        return rows.map((r: any) => Number(r.ur_rol_id));
      }
    }

    // Login "genérico" (AuthService.login) no siempre puebla pc_usuario_rol
    // para el usuario — como red de seguridad, cae a resolver por el código
    // de rol del JWT directamente contra pc_roles.
    if (user?.rol) {
      const rows = await this.dataSource.query(
        `SELECT rol_id FROM pc_roles WHERE rol_codigo = @0`,
        [user.rol],
      );
      return rows.map((r: any) => Number(r.rol_id));
    }

    return [];
  }

  async getModulesByRole(rolId: number): Promise<MenuModulo[]> {
    console.log(
      `[PermissionsService] getModulesByRole called with rolId: ${rolId}`,
    );

    if (!rolId || rolId <= 0) {
      console.warn(`[PermissionsService] Invalid rolId: ${rolId}`);
      return [];
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        m.mod_id,
        m.mod_nombre,
        m.mod_ruta,
        m.mod_icono,
        m.mod_posicion AS mod_orden,
        m.mod_padre_id,
        m.mod_estado AS mod_activo,
        ISNULL(rm.rm_ver, 0) AS ver,
        ISNULL(rm.rm_crear, 0) AS crear,
        ISNULL(rm.rm_editar, 0) AS editar,
        ISNULL(rm.rm_eliminar, 0) AS eliminar,
        ISNULL(rm.rm_aprobar, 0) AS aprobar
      FROM dbo.pc_modulos m
      LEFT JOIN dbo.pc_rol_modulo rm
        ON m.mod_id = rm.rm_mod_id
        AND rm.rm_rol_id = @0
        AND rm.rm_activo = 1
      WHERE m.mod_estado = 1
      ORDER BY m.mod_posicion, m.mod_nombre
      `,
      [rolId],
    );

    const allRowsById = new Map<number, any>();
    const viewableIds = new Set<number>();

    rows.forEach((row: any) => {
      const modId = Number(row.mod_id);
      allRowsById.set(modId, row);

      if (row.ver) {
        viewableIds.add(modId);
      }
    });

    const visibleIds = new Set<number>(viewableIds);
    viewableIds.forEach((id) => {
      let current = allRowsById.get(id);
      while (current?.mod_padre_id) {
        visibleIds.add(Number(current.mod_padre_id));
        current = allRowsById.get(Number(current.mod_padre_id));
      }
    });

    const modulesMap = new Map<number, MenuModulo>();
    rows.forEach((row: any) => {
      const modId = Number(row.mod_id);
      if (!visibleIds.has(modId)) {
        return;
      }

      const isDirectlyAssigned = viewableIds.has(modId);

      modulesMap.set(modId, {
        mod_id: row.mod_id,
        mod_codigo: '',
        mod_nombre: row.mod_nombre,
        mod_ruta: row.mod_ruta ? String(row.mod_ruta).trim() : null,
        mod_icono: row.mod_icono ?? null,
        mod_orden: Number(row.mod_orden ?? 0),
        mod_padre_id: row.mod_padre_id ?? null,
        mod_activo: Boolean(row.mod_activo),
        permisos: isDirectlyAssigned
          ? {
              ver: Boolean(row.ver),
              crear: Boolean(row.crear),
              editar: Boolean(row.editar),
              eliminar: Boolean(row.eliminar),
              aprobar: Boolean(row.aprobar),
            }
          : {
              ver: true,
              crear: false,
              editar: false,
              eliminar: false,
              aprobar: false,
            },
        subModulos: [],
      });
    });

    const roots: MenuModulo[] = [];
    modulesMap.forEach((moduleItem) => {
      if (!moduleItem.mod_padre_id) {
        roots.push(moduleItem);
        return;
      }

      const parent = modulesMap.get(moduleItem.mod_padre_id);
      if (parent) {
        parent.subModulos.push(moduleItem);
      } else {
        roots.push(moduleItem);
      }
    });

    const sortModules = (items: MenuModulo[]) => {
      items.sort((a, b) => {
        if (a.mod_orden !== b.mod_orden) return a.mod_orden - b.mod_orden;
        return a.mod_nombre.localeCompare(b.mod_nombre);
      });
      items.forEach((child) => sortModules(child.subModulos));
    };

    sortModules(roots);
    return roots;
  }

  async getModulesByUsuario(usuarioId: number): Promise<MenuModulo[]> {
    console.log(
      `[PermissionsService] getModulesByUsuario called with usuarioId: ${usuarioId}`,
    );

    if (!usuarioId || usuarioId <= 0) {
      console.warn(`[PermissionsService] Invalid usuarioId: ${usuarioId}`);
      return [];
    }

    // Obtener módulos para todos los roles del usuario usando subquery
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT
        m.mod_id,
        m.mod_nombre,
        m.mod_ruta,
        m.mod_icono,
        m.mod_posicion AS mod_orden,
        m.mod_padre_id,
        m.mod_estado AS mod_activo,
        MAX(CAST(ISNULL(rm.rm_ver, 0) AS INT)) AS ver,
        MAX(CAST(ISNULL(rm.rm_crear, 0) AS INT)) AS crear,
        MAX(CAST(ISNULL(rm.rm_editar, 0) AS INT)) AS editar,
        MAX(CAST(ISNULL(rm.rm_eliminar, 0) AS INT)) AS eliminar,
        MAX(CAST(ISNULL(rm.rm_aprobar, 0) AS INT)) AS aprobar
      FROM dbo.pc_modulos m
      LEFT JOIN dbo.pc_rol_modulo rm
        ON m.mod_id = rm.rm_mod_id
        AND rm.rm_activo = 1
        AND rm.rm_rol_id IN (
          SELECT ur.ur_rol_id
          FROM dbo.pc_usuario_rol ur
          WHERE ur.ur_usuario_id = @0 AND ur.ur_activo = 1
        )
      GROUP BY m.mod_id, m.mod_nombre, m.mod_ruta, m.mod_icono, m.mod_posicion, m.mod_padre_id, m.mod_estado
      ORDER BY m.mod_posicion, m.mod_nombre
      `,
      [usuarioId],
    );

    if (!rows || rows.length === 0) {
      console.warn(
        `[PermissionsService] No modules found for usuarioId: ${usuarioId}`,
      );
      return [];
    }

    const allRowsById = new Map<number, any>();
    const viewableIds = new Set<number>();

    rows.forEach((row: any) => {
      const modId = Number(row.mod_id);
      allRowsById.set(modId, row);

      if (row.ver) {
        viewableIds.add(modId);
      }
    });

    const visibleIds = new Set<number>(viewableIds);
    viewableIds.forEach((id) => {
      let current = allRowsById.get(id);
      while (current?.mod_padre_id) {
        visibleIds.add(Number(current.mod_padre_id));
        current = allRowsById.get(Number(current.mod_padre_id));
      }
    });

    console.log(
      `[PermissionsService] getModulesByUsuario DEBUG - rows: ${rows.length}, viewableIds: ${viewableIds.size}, visibleIds: ${visibleIds.size}, visibleIds: [${Array.from(
        visibleIds,
      )
        .sort((a, b) => a - b)
        .join(',')}]`,
    );

    const modulesMap = new Map<number, MenuModulo>();
    rows.forEach((row: any) => {
      const modId = Number(row.mod_id);
      if (!visibleIds.has(modId)) {
        return;
      }

      const isDirectlyAssigned = viewableIds.has(modId);

      modulesMap.set(modId, {
        mod_id: row.mod_id,
        mod_codigo: '',
        mod_nombre: row.mod_nombre,
        mod_ruta: row.mod_ruta ? String(row.mod_ruta).trim() : null,
        mod_icono: row.mod_icono ?? null,
        mod_orden: Number(row.mod_orden ?? 0),
        mod_padre_id: row.mod_padre_id ?? null,
        mod_activo: Boolean(row.mod_activo),
        permisos: isDirectlyAssigned
          ? {
              ver: Boolean(row.ver),
              crear: Boolean(row.crear),
              editar: Boolean(row.editar),
              eliminar: Boolean(row.eliminar),
              aprobar: Boolean(row.aprobar),
            }
          : {
              ver: true,
              crear: false,
              editar: false,
              eliminar: false,
              aprobar: false,
            },
        subModulos: [],
      });
    });

    console.log(
      `[PermissionsService] getModulesByUsuario - modulesMap count: ${modulesMap.size}`,
    );

    const roots: MenuModulo[] = [];
    let withoutParent = 0;
    let withParent = 0;
    let parentNotFound = 0;

    modulesMap.forEach((moduleItem) => {
      if (!moduleItem.mod_padre_id) {
        roots.push(moduleItem);
        withoutParent++;
        return;
      }

      const parent = modulesMap.get(moduleItem.mod_padre_id);
      if (parent) {
        parent.subModulos.push(moduleItem);
        withParent++;
      } else {
        console.log(
          `[PermissionsService] Parent not found for module ${moduleItem.mod_id} (${moduleItem.mod_nombre}) with parent id ${moduleItem.mod_padre_id}`,
        );
        roots.push(moduleItem);
        parentNotFound++;
      }
    });

    console.log(
      `[PermissionsService] getModulesByUsuario - withoutParent: ${withoutParent}, withParent: ${withParent}, parentNotFound: ${parentNotFound}, roots: ${roots.length}`,
    );

    // Log para verificar qué submódulos tiene cada raíz
    roots.forEach((root) => {
      console.log(
        `[PermissionsService] Root "${root.mod_nombre}" has ${root.subModulos.length} subModulos`,
      );
    });

    const sortModules = (items: MenuModulo[]) => {
      items.sort((a, b) => {
        if (a.mod_orden !== b.mod_orden) return a.mod_orden - b.mod_orden;
        return a.mod_nombre.localeCompare(b.mod_nombre);
      });
      items.forEach((child) => sortModules(child.subModulos));
    };

    sortModules(roots);
    return roots;
  }
}
