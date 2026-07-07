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
