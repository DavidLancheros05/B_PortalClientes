import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from './entities/role.entity';
import { RolModuloEntity } from './entities/rol-modulo.entity';
import { ModuloEntity } from 'src/modulos/entities/modulo.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private roleRepository: Repository<RoleEntity>,
    @InjectRepository(RolModuloEntity)
    private rolModuloRepository: Repository<RolModuloEntity>,
    @InjectRepository(ModuloEntity)
    private moduloRepository: Repository<ModuloEntity>,
  ) {}

  async create(createRoleDto: CreateRoleDto): Promise<RoleEntity> {
    const role = this.roleRepository.create(createRoleDto);
    return this.roleRepository.save(role);
  }

  async findAll(): Promise<any[]> {
    console.log('[RolesService] findAll called');
    return [];
  }

  async findOne(id: number): Promise<any> {
    const role = await this.roleRepository.findOne({
      where: { rolId: id },
      relations: ['modulos'],
    });

    if (!role) {
      throw new NotFoundException(`Rol con ID ${id} no encontrado`);
    }

    return this.enrichRoleWithModules(role);
  }

  private async enrichRoleWithModules(role: RoleEntity): Promise<any> {
    const allModulos = await this.getActualModulos();
    const rolesPermisos = await this.rolModuloRepository.find({
      where: { rmRolId: role.rolId, rmActivo: true },
    });

    const permisosMap = new Map(
      rolesPermisos.map((p) => [
        p.rmModId,
        {
          ver: p.rmVer,
          crear: p.rmCrear,
          editar: p.rmEditar,
          eliminar: p.rmEliminar,
          aprobar: p.rmAprobar,
        },
      ]),
    );

    const map = new Map(
      allModulos.map((m) => [
        m.mod_id,
        {
          mod_id: m.mod_id,
          mod_nombre: m.mod_nombre,
          mod_ruta: m.mod_ruta,
          mod_icono: m.mod_icono,
          mod_padre_id: m.mod_padre_id,
          permisos: permisosMap.get(m.mod_id) || {
            ver: false,
            crear: false,
            editar: false,
            eliminar: false,
            aprobar: false,
          },
          subModulos: [],
        },
      ]),
    );

    const arbol: any[] = [];
    map.forEach((mod) => {
      if (!mod.mod_padre_id) {
        arbol.push(mod);
      } else {
        const padre = map.get(mod.mod_padre_id);
        if (padre) {
          padre.subModulos.push(mod);
        }
      }
    });

    return {
      rolId: role.rolId,
      rolNombre: role.rolNombre,
      rolDescripcion: role.rolDescripcion,
      rolCodigo: role.rolCodigo,
      rolActivo: role.rolActivo,
      modulos: arbol,
    };
  }

  private async getActualModulos(): Promise<any[]> {
    return this.moduloRepository.find({
      where: { mod_activo: true },
      order: { mod_posicion: 'ASC' },
    });
  }

  async update(id: number, updateRoleDto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.findOne(id);
    const { modulos, ...roleData } = updateRoleDto;
    Object.assign(role, roleData);
    const updatedRole = await this.roleRepository.save(role);

    if (modulos && modulos.length > 0) {
      await this.updateModulesForRole(id, modulos);
    }

    return updatedRole;
  }

  private async updateModulesForRole(
    rolId: number,
    modulos: any[],
  ): Promise<void> {
    const collectIds = (mods: any[]): number[] => {
      const ids: number[] = [];
      mods.forEach((m) => {
        ids.push(m.mod_id);
        if (m.subModulos?.length) {
          ids.push(...collectIds(m.subModulos));
        }
      });
      return ids;
    };

    const sentIds = collectIds(modulos);

    // Inactivate permissions not in the new list
    if (sentIds.length > 0) {
      await this.rolModuloRepository
        .createQueryBuilder()
        .update(RolModuloEntity)
        .set({ rmActivo: false })
        .where('rmRolId = :rolId', { rolId })
        .andWhere('rmModId NOT IN (:...modIds)', { modIds: sentIds })
        .execute();
    }

    // Update or insert permissions
    const processModules = async (mods: any[]): Promise<void> => {
      for (const mod of mods) {
        let rolModulo = await this.rolModuloRepository.findOne({
          where: { rmRolId: rolId, rmModId: mod.mod_id },
        });

        if (!rolModulo) {
          rolModulo = this.rolModuloRepository.create({
            rmRolId: rolId,
            rmModId: mod.mod_id,
          });
        }

        rolModulo.rmVer = mod.permisos.ver || false;
        rolModulo.rmCrear = mod.permisos.crear || false;
        rolModulo.rmEditar = mod.permisos.editar || false;
        rolModulo.rmEliminar = mod.permisos.eliminar || false;
        rolModulo.rmAprobar = mod.permisos.aprobar || false;
        rolModulo.rmActivo = true;

        await this.rolModuloRepository.save(rolModulo);

        if (mod.subModulos?.length) {
          await processModules(mod.subModulos);
        }
      }
    };

    await processModules(modulos);
  }

  async remove(id: number): Promise<void> {
    const role = await this.findOne(id);
    role.rolActivo = false;
    await this.roleRepository.save(role);
  }

  async getModulesByRole(rolId: number): Promise<RolModuloEntity[]> {
    return this.rolModuloRepository.find({
      where: { rmRolId: rolId, rmActivo: true },
    });
  }

  async assignModuleToRole(
    rolId: number,
    modId: number,
    permissions: {
      ver?: boolean;
      crear?: boolean;
      editar?: boolean;
      eliminar?: boolean;
      aprobar?: boolean;
    },
  ): Promise<RolModuloEntity> {
    let rolModulo = await this.rolModuloRepository.findOne({
      where: { rmRolId: rolId, rmModId: modId },
    });

    if (!rolModulo) {
      rolModulo = this.rolModuloRepository.create({
        rmRolId: rolId,
        rmModId: modId,
      });
    }

    if (permissions.ver !== undefined) rolModulo.rmVer = permissions.ver;
    if (permissions.crear !== undefined) rolModulo.rmCrear = permissions.crear;
    if (permissions.editar !== undefined)
      rolModulo.rmEditar = permissions.editar;
    if (permissions.eliminar !== undefined)
      rolModulo.rmEliminar = permissions.eliminar;
    if (permissions.aprobar !== undefined)
      rolModulo.rmAprobar = permissions.aprobar;

    return this.rolModuloRepository.save(rolModulo);
  }

  async removeModuleFromRole(rolId: number, modId: number): Promise<void> {
    const rolModulo = await this.rolModuloRepository.findOne({
      where: { rmRolId: rolId, rmModId: modId },
    });

    if (rolModulo) {
      rolModulo.rmActivo = false;
      await this.rolModuloRepository.save(rolModulo);
    }
  }
}
