import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

// Roles de los que depende la lógica del sistema (login, portal de
// clientes): inactivarlos dejaría a todos sus usuarios sin acceso.
const ROLES_NO_INACTIVABLES = ['ADMIN', 'CLIENTE'];

@Injectable()
export class SeguridadService {
  constructor(private readonly dataSource: DataSource) {}

  // incluirInactivos: solo la pantalla de Roles los pide (para poder
  // reactivarlos); las demás pantallas asignan roles y solo deben ver los
  // activos.
  async getRoles(incluirInactivos = false) {
    // 3 consultas en total (antes: 2 por rol, y la lista de módulos se
    // repetía idéntica para cada rol).
    const roles = await this.dataSource.query(`
      SELECT *
      FROM pc_roles
      ${incluirInactivos ? '' : 'WHERE rol_activo = 1'}
      ORDER BY rol_id
    `);

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

    const todosPermisos = await this.dataSource.query(`
      SELECT
        rm.rm_rol_id, rm.rm_mod_id AS mod_id,
        rm.rm_ver, rm.rm_crear, rm.rm_editar, rm.rm_eliminar, rm.rm_aprobar
      FROM pc_rol_modulo rm
      INNER JOIN pc_roles r ON r.rol_id = rm.rm_rol_id
        ${incluirInactivos ? '' : 'AND r.rol_activo = 1'}
      WHERE rm.rm_activo = 1
    `);

    for (const rol of roles) {
      const permisosMap: Record<number, any> = {};
      todosPermisos
        .filter((p: any) => p.rm_rol_id === rol.rol_id)
        .forEach((p: any) => {
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

  // Aplana el árbol de módulos que manda la pantalla a filas
  // {mod_id, ver, crear, editar, eliminar, aprobar}. Solo ids enteros
  // válidos; un mismo módulo repetido se queda con la última aparición.
  private aplanarPermisos(modulos: any[] | undefined) {
    const porModulo = new Map<number, Record<string, number>>();
    const recorrer = (mods: any[]) => {
      for (const m of mods || []) {
        const modId = Number(m?.mod_id);
        if (Number.isInteger(modId) && modId > 0) {
          const p = m.permisos || {};
          porModulo.set(modId, {
            mod_id: modId,
            ver: p.ver ? 1 : 0,
            crear: p.crear ? 1 : 0,
            editar: p.editar ? 1 : 0,
            eliminar: p.eliminar ? 1 : 0,
            aprobar: p.aprobar ? 1 : 0,
          });
        }
        if (m?.subModulos?.length) recorrer(m.subModulos);
      }
    };
    recorrer(modulos || []);
    return Array.from(porModulo.values());
  }

  // Deja pc_rol_modulo del rol EXACTAMENTE como la lista recibida, en 2
  // sentencias (antes: SELECT + UPDATE/INSERT por módulo, ~120 viajes al
  // servidor para ADMIN → 35-40 s). Lo que no viene en la lista se
  // desactiva — también cuando la lista viene vacía (antes, quitar todos
  // los permisos de un rol no quitaba ninguno).
  private async sincronizarPermisosRol(
    runner: QueryRunner,
    rolId: number,
    modulos: any[] | undefined,
  ) {
    const filas = JSON.stringify(this.aplanarPermisos(modulos));
    const esquemaJson = `
      WITH (mod_id INT, ver BIT, crear BIT, editar BIT, eliminar BIT, aprobar BIT)
    `;

    await runner.query(
      `
        UPDATE pc_rol_modulo
        SET rm_activo = 0, updated_at = SYSDATETIME()
        WHERE rm_rol_id = @0 AND rm_activo = 1
          AND rm_mod_id NOT IN (SELECT mod_id FROM OPENJSON(@1) ${esquemaJson})
      `,
      [rolId, filas],
    );

    await runner.query(
      `
        MERGE pc_rol_modulo AS destino
        USING (SELECT * FROM OPENJSON(@1) ${esquemaJson}) AS origen
          ON destino.rm_rol_id = @0 AND destino.rm_mod_id = origen.mod_id
        WHEN MATCHED THEN UPDATE SET
          rm_ver = origen.ver, rm_crear = origen.crear, rm_editar = origen.editar,
          rm_eliminar = origen.eliminar, rm_aprobar = origen.aprobar,
          rm_activo = 1, updated_at = SYSDATETIME()
        WHEN NOT MATCHED THEN INSERT
          (rm_rol_id, rm_mod_id, rm_ver, rm_crear, rm_editar, rm_eliminar, rm_aprobar, rm_activo, rm_created_at)
          VALUES (@0, origen.mod_id, origen.ver, origen.crear, origen.editar, origen.eliminar, origen.aprobar, 1, SYSDATETIME());
      `,
      [rolId, filas],
    );
  }

  // Todo en una transacción: si algo falla, el rol no queda guardado a
  // medias (antes cada sentencia se confirmaba sola).
  private async enTransaccion<T>(trabajo: (runner: QueryRunner) => Promise<T>) {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const resultado = await trabajo(runner);
      await runner.commitTransaction();
      return resultado;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async crearRol(data: any) {
    const nombre = String(data.rol_nombre ?? data.nombre ?? '').trim();
    const descripcion = data.rol_descripcion ?? data.descripcion;
    // rol_codigo es NOT NULL sin default: antes no se insertaba y crear
    // un rol fallaba siempre.
    const codigo = String(data.rol_codigo ?? '').trim().toUpperCase();
    if (!nombre || !codigo) {
      throw new BadRequestException('El nombre y el código del rol son obligatorios');
    }

    return this.enTransaccion(async (runner) => {
      // pc_roles no tiene índice único sobre rol_codigo, y el código es lo
      // que usa la lógica del sistema para reconocer el rol.
      const [existente] = await runner.query(
        `SELECT TOP 1 rol_id FROM pc_roles WHERE rol_codigo = @0`,
        [codigo],
      );
      if (existente) {
        throw new ConflictException(`Ya existe un rol con el código ${codigo}`);
      }

      const [rolCreado] = await runner.query(
        `
          INSERT INTO pc_roles (rol_nombre, rol_descripcion, rol_codigo, rol_activo, rol_created_at)
          OUTPUT INSERTED.*
          VALUES (@0, @1, @2, 1, SYSDATETIME())
        `,
        [nombre, descripcion || null, codigo],
      );

      await this.sincronizarPermisosRol(runner, rolCreado.rol_id, data.modulos);

      return { message: 'Rol creado correctamente', rol: rolCreado };
    });
  }

  async actualizarRol(id: number, data: any) {
    if (data.rol_activo === false || data.rol_activo === 0) {
      await this.validarPuedeInactivar(id);
    }

    return this.enTransaccion(async (runner) => {
      // Cada campo solo se toca si vino en el body: un update de solo
      // permisos no debe borrar la descripción ni cambiar el estado.
      const traeDescripcion = data.rol_descripcion !== undefined;
      const activo =
        data.rol_activo === undefined || data.rol_activo === null
          ? null
          : data.rol_activo
            ? 1
            : 0;

      await runner.query(
        `
          UPDATE pc_roles
          SET rol_nombre = COALESCE(@0, rol_nombre),
              rol_descripcion = CASE WHEN @3 = 1 THEN @1 ELSE rol_descripcion END,
              rol_activo = COALESCE(@4, rol_activo),
              rol_updated_at = SYSDATETIME()
          WHERE rol_id = @2
        `,
        [
          data.rol_nombre || null,
          data.rol_descripcion || null,
          id,
          traeDescripcion ? 1 : 0,
          activo,
        ],
      );

      // Solo se tocan los permisos si la pantalla los mandó (un update
      // de solo nombre/descripción no debe borrar los permisos).
      if (data.modulos !== undefined) {
        await this.sincronizarPermisosRol(runner, id, data.modulos);
      }

      return { message: 'Rol actualizado correctamente' };
    });
  }

  private async validarPuedeInactivar(id: number) {
    const [rol] = await this.dataSource.query(
      `SELECT rol_codigo, rol_activo FROM pc_roles WHERE rol_id = @0`,
      [id],
    );
    if (!rol) throw new NotFoundException('Rol no encontrado');
    // Ya inactivo: guardar sus permisos no es "inactivarlo" otra vez.
    if (!rol.rol_activo) return;

    if (ROLES_NO_INACTIVABLES.includes(String(rol.rol_codigo).toUpperCase())) {
      throw new BadRequestException(
        `El rol ${rol.rol_codigo} es del sistema y no se puede inactivar`,
      );
    }

    const [{ usuarios }] = await this.dataSource.query(
      `SELECT COUNT(*) AS usuarios FROM pc_usuario_rol WHERE ur_rol_id = @0 AND ur_activo = 1`,
      [id],
    );
    if (usuarios > 0) {
      throw new BadRequestException(
        `No se puede inactivar: el rol tiene ${usuarios} usuario(s) asignado(s). Quítaselo primero.`,
      );
    }
  }

  async inactivarRol(id: number) {
    await this.validarPuedeInactivar(id);

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
}
