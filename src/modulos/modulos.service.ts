import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuloEntity } from './entities/modulo.entity';
import { CreateModuloDto } from './dto/create-modulo.dto';
import { UpdateModuloDto } from './dto/update-modulo.dto';

@Injectable()
export class ModulosService {
  constructor(
    @InjectRepository(ModuloEntity)
    private readonly moduloRepository: Repository<ModuloEntity>,
  ) {}

  private normalizeRoute(rawRoute: string): string {
    const trimmed = String(rawRoute || '').trim();
    if (!trimmed) return '';

    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const collapsed = withLeadingSlash.replace(/\/+/g, '/');

    if (collapsed.length > 1 && collapsed.endsWith('/')) {
      return collapsed.slice(0, -1);
    }

    return collapsed;
  }

  private slugifySegment(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private collapseDuplicatedTailSegment(route: string): string {
    const normalized = this.normalizeRoute(route);
    if (!normalized || normalized === '/') return normalized;

    const parts = normalized.split('/').filter(Boolean);
    while (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const prev = parts[parts.length - 2];
      if (last !== prev) break;
      parts.pop();
    }

    return `/${parts.join('/')}`;
  }

  private async getUniqueRoute(
    baseRoute: string,
    moduloActualId?: number,
  ): Promise<string> {
    let candidate = this.normalizeRoute(baseRoute);
    let suffix = 2;

    while (true) {
      const query = this.moduloRepository.createQueryBuilder('m');
      query.where('m.mod_ruta = :ruta', { ruta: candidate });

      if (moduloActualId) {
        query.andWhere('m.mod_id != :id', { id: moduloActualId });
      }

      const existing = await query.getOne();
      if (!existing) {
        return candidate;
      }

      candidate = `${baseRoute}-${suffix}`;
      suffix += 1;
    }
  }

  private async buildAutoRoute(
    nombre: string,
    padreId: number | null,
    moduloActualId?: number,
  ): Promise<string> {
    const slug = this.slugifySegment(nombre);
    if (!slug) {
      throw new BadRequestException(
        'El nombre no permite generar una ruta automática válida',
      );
    }

    if (!padreId) {
      return this.getUniqueRoute(`/${slug}`, moduloActualId);
    }

    const parent = await this.moduloRepository.findOne({
      where: { mod_id: padreId, mod_activo: true },
    });

    if (!parent) {
      throw new BadRequestException(
        'El módulo padre no existe o está inactivo',
      );
    }

    const parentRoute = this.normalizeRoute(parent.mod_ruta);
    if (!parentRoute) {
      throw new BadRequestException('El módulo padre no tiene una ruta válida');
    }

    const baseParentRoute = this.collapseDuplicatedTailSegment(parentRoute);

    // Evitar que el slug sea igual al último segmento de la ruta padre
    const parentSegments = baseParentRoute.split('/').filter(Boolean);
    const lastParentSegment = parentSegments[parentSegments.length - 1];

    const finalSlug = slug;
    if (lastParentSegment && lastParentSegment === slug) {
      // Si el slug es igual al último segmento del padre, usar la ruta del padre directamente
      return this.getUniqueRoute(baseParentRoute, moduloActualId);
    }

    return this.getUniqueRoute(
      `${baseParentRoute}/${finalSlug}`,
      moduloActualId,
    );
  }

  private async validateJerarquiaYRuta(
    data: any,
    moduloActualId?: number,
  ): Promise<{ rutaNormalizada: string; padreId: number | null }> {
    const padreIdRaw = data.padre_id;
    const padreId =
      padreIdRaw === undefined || padreIdRaw === null || padreIdRaw === ''
        ? null
        : Number(padreIdRaw);

    if (padreId !== null && (!Number.isInteger(padreId) || padreId <= 0)) {
      throw new BadRequestException('padre_id inválido');
    }

    if (moduloActualId && padreId === moduloActualId) {
      throw new BadRequestException('Un módulo no puede ser su propio padre');
    }

    if (!data.ruta) {
      throw new BadRequestException(
        'La ruta es obligatoria y debe ser proporcionada manualmente',
      );
    }

    const rutaNormalizada = this.normalizeRoute(data.ruta);

    if (!rutaNormalizada) {
      throw new BadRequestException(
        'No se pudo normalizar la ruta proporcionada',
      );
    }

    if (padreId !== null) {
      const parent = await this.moduloRepository.findOne({
        where: { mod_id: padreId, mod_activo: true },
      });

      if (!parent) {
        throw new BadRequestException(
          'El módulo padre no existe o está inactivo',
        );
      }

      const parentRoute = this.normalizeRoute(parent.mod_ruta);
      if (!parentRoute) {
        throw new BadRequestException(
          'El módulo padre no tiene una ruta válida',
        );
      }

      const baseParentRoute = this.collapseDuplicatedTailSegment(parentRoute);

      if (
        rutaNormalizada === parentRoute ||
        rutaNormalizada === baseParentRoute
      ) {
        throw new BadRequestException(
          'La ruta del submódulo no puede ser igual a la ruta del módulo padre',
        );
      }

      const hasOriginalPrefix = rutaNormalizada.startsWith(`${parentRoute}/`);
      const hasBasePrefix = rutaNormalizada.startsWith(`${baseParentRoute}/`);

      if (!hasOriginalPrefix && !hasBasePrefix) {
        throw new BadRequestException(
          `La ruta del submódulo debe iniciar con '${baseParentRoute}/' para mantener coherencia jerárquica`,
        );
      }

      if (moduloActualId) {
        const hasCycle = await this.checkHierarchyCycle(
          moduloActualId,
          padreId,
        );
        if (hasCycle) {
          throw new BadRequestException(
            'La jerarquía es inválida: el padre seleccionado genera un ciclo',
          );
        }
      }
    }

    return { rutaNormalizada, padreId };
  }

  private async checkHierarchyCycle(
    currentId: number,
    padreId: number,
  ): Promise<boolean> {
    const visited = new Set<number>();
    let current = padreId;

    while (current) {
      if (visited.has(current)) return true;
      if (current === currentId) return true;

      visited.add(current);

      const parent = await this.moduloRepository.findOne({
        where: { mod_id: current },
        select: ['mod_padre_id'],
      });

      current = parent?.mod_padre_id;
    }

    return false;
  }

  private normalizeRequestedOrder(value: any): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    const integer = Math.trunc(parsed);
    return integer > 0 ? integer : null;
  }

  private getBoundedIndex(
    requestedOrder: number | null,
    length: number,
  ): number {
    if (length <= 0) {
      return 0;
    }

    if (requestedOrder === null) {
      return length;
    }

    return Math.max(0, Math.min(requestedOrder - 1, length));
  }

  private async getSiblingIdsByParent(
    parentId: number | null,
    excludeModuloId?: number,
  ): Promise<number[]> {
    const query = this.moduloRepository
      .createQueryBuilder('m')
      .select('m.mod_id', 'mod_id')
      .where('m.mod_activo = :activo', { activo: true });

    if (parentId === null) {
      query.andWhere('m.mod_padre_id IS NULL');
    } else {
      query.andWhere('m.mod_padre_id = :padreId', { padreId: parentId });
    }

    if (excludeModuloId !== undefined) {
      query.andWhere('m.mod_id != :excludeId', { excludeId: excludeModuloId });
    }

    query.orderBy('m.mod_posicion', 'ASC').addOrderBy('m.mod_id', 'ASC');

    const result = await query.getRawMany();
    return result.map((row) => Number(row.mod_id));
  }

  private async applySiblingOrder(
    parentId: number | null,
    orderedIds: number[],
  ): Promise<void> {
    if (!orderedIds.length) {
      return;
    }

    for (let index = 0; index < orderedIds.length; index += 1) {
      await this.moduloRepository.update(
        { mod_id: orderedIds[index] },
        {
          mod_padre_id: parentId,
          mod_posicion: index + 1,
          mod_updated_at: new Date(),
        },
      );
    }
  }

  async findAll(): Promise<ModuloEntity[]> {
    const modulos = await this.moduloRepository.find({
      order: { mod_posicion: 'ASC' },
    });

    return this.buildTree(modulos);
  }

  private buildTree(modulos: ModuloEntity[]): ModuloEntity[] {
    const map = new Map<number, ModuloEntity>();

    modulos.forEach((m) => {
      map.set(m.mod_id, { ...m, subModulos: [] });
    });

    const tree: ModuloEntity[] = [];

    modulos.forEach((m) => {
      const mod = map.get(m.mod_id);
      if (!mod) return;

      if (!m.mod_padre_id) {
        tree.push(mod);
      } else {
        const padre = map.get(m.mod_padre_id);
        if (padre) {
          padre.subModulos.push(mod);
        }
      }
    });

    const sortTree = (nodes: ModuloEntity[]) => {
      nodes.sort((a, b) => (a.mod_posicion || 0) - (b.mod_posicion || 0));
      nodes.forEach((node) => sortTree(node.subModulos || []));
    };

    sortTree(tree);
    return tree;
  }

  async findById(id: number): Promise<ModuloEntity> {
    const modulo = await this.moduloRepository.findOne({
      where: { mod_id: id },
    });

    if (!modulo) {
      throw new BadRequestException(`Módulo con ID ${id} no encontrado`);
    }

    return modulo;
  }

  async create(createModuloDto: CreateModuloDto): Promise<{ message: string }> {
    const { rutaNormalizada, padreId } =
      await this.validateJerarquiaYRuta(createModuloDto);

    const requestedOrder = this.normalizeRequestedOrder(createModuloDto.orden);
    const siblingIds = await this.getSiblingIdsByParent(padreId);
    const insertIndex = this.getBoundedIndex(requestedOrder, siblingIds.length);

    const nuevoModulo = this.moduloRepository.create({
      mod_nombre: createModuloDto.nombre,
      mod_ruta: rutaNormalizada,
      mod_icono: createModuloDto.icono || null,
      mod_posicion: 999999,
      mod_padre_id: padreId,
      mod_activo: true,
    });

    const saved = await this.moduloRepository.save(nuevoModulo);
    const moduloIdCreado = saved.mod_id;

    const orderedIds = [...siblingIds];
    orderedIds.splice(insertIndex, 0, moduloIdCreado);
    await this.applySiblingOrder(padreId, orderedIds);

    return { message: 'Módulo creado correctamente' };
  }

  async update(
    id: number,
    updateModuloDto: UpdateModuloDto,
  ): Promise<{ message: string; rowsAffected: number }> {
    const moduloActual = await this.findById(id);

    const nombre = updateModuloDto.nombre || moduloActual.mod_nombre;
    const icono =
      updateModuloDto.icono !== undefined
        ? updateModuloDto.icono
        : moduloActual.mod_icono;
    const orden =
      updateModuloDto.orden !== undefined
        ? updateModuloDto.orden
        : moduloActual.mod_posicion;
    const requestedOrder = this.normalizeRequestedOrder(orden);
    const padreInput =
      updateModuloDto.padre_id !== undefined
        ? updateModuloDto.padre_id
        : moduloActual.mod_padre_id;

    const hasRutaInPayload =
      updateModuloDto.ruta !== undefined &&
      updateModuloDto.ruta !== null &&
      String(updateModuloDto.ruta).trim() !== '';

    const currentParentId = moduloActual.mod_padre_id ?? null;
    const nextParentId = padreInput ?? null;
    const parentChanged = currentParentId !== nextParentId;
    const nameChanged =
      String(nombre || '').trim() !==
      String(moduloActual.mod_nombre || '').trim();

    const shouldValidateRoute =
      hasRutaInPayload || parentChanged || nameChanged;
    const validated = shouldValidateRoute
      ? await this.validateJerarquiaYRuta(
          {
            nombre,
            ruta: hasRutaInPayload ? updateModuloDto.ruta : undefined,
            padre_id: padreInput,
          },
          id,
        )
      : null;

    const rutaNormalizada =
      validated?.rutaNormalizada ||
      this.normalizeRoute(moduloActual.mod_ruta || '');
    const padreId = validated?.padreId ?? currentParentId;

    await this.moduloRepository.update(
      { mod_id: id },
      {
        mod_nombre: nombre,
        mod_ruta: rutaNormalizada,
        mod_icono: icono || null,
        mod_posicion: orden,
        mod_padre_id: padreId,
        mod_updated_at: new Date(),
      },
    );

    const siblingsInTargetParent = await this.getSiblingIdsByParent(
      padreId,
      id,
    );
    const targetIndex = this.getBoundedIndex(
      requestedOrder,
      siblingsInTargetParent.length,
    );

    const reorderedTarget = [...siblingsInTargetParent];
    reorderedTarget.splice(targetIndex, 0, id);
    await this.applySiblingOrder(padreId, reorderedTarget);

    const oldParentId = moduloActual.mod_padre_id ?? null;
    if (oldParentId !== padreId) {
      const reorderedOldParent = await this.getSiblingIdsByParent(
        oldParentId,
        id,
      );
      await this.applySiblingOrder(oldParentId, reorderedOldParent);
    }

    return { message: 'Módulo actualizado', rowsAffected: 1 };
  }

  async remove(id: number): Promise<{ message: string }> {
    await this.findById(id);

    await this.moduloRepository.update(
      { mod_id: id },
      {
        mod_activo: false,
        mod_updated_at: new Date(),
      },
    );

    return { message: 'Módulo inactivado' };
  }

  async activate(id: number): Promise<{ message: string }> {
    await this.findById(id);

    await this.moduloRepository.update(
      { mod_id: id },
      {
        mod_activo: true,
        mod_updated_at: new Date(),
      },
    );

    return { message: 'Módulo activado' };
  }

  async findByRol(rolId: number) {
    const modulos = await this.moduloRepository
      .createQueryBuilder('m')
      .leftJoin('m.roles', 'rm', 'rm.rm_rol_id = :rolId', { rolId })
      .select([
        'm.mod_id as mod_id',
        'm.mod_nombre as mod_nombre',
        'm.mod_ruta as mod_ruta',
        'm.mod_icono as mod_icono',
        'm.mod_posicion as mod_posicion',
        'm.mod_padre_id as mod_padre_id',
        'm.mod_estado as mod_activo',
      ])
      .addSelect('ISNULL(rm.rm_ver, 0) as ver')
      .addSelect('ISNULL(rm.rm_crear, 0) as crear')
      .addSelect('ISNULL(rm.rm_editar, 0) as editar')
      .addSelect('ISNULL(rm.rm_eliminar, 0) as eliminar')
      .addSelect('ISNULL(rm.rm_aprobar, 0) as aprobar')
      .where('m.mod_estado = 1')
      .orderBy('m.mod_posicion', 'ASC')
      .addOrderBy('m.mod_id', 'ASC')
      .getRawMany();

    const modulosMap = new Map();
    const result: any[] = [];

    modulos.forEach((row) => {
      const modulo = {
        mod_id: Number(row.mod_id),
        mod_nombre: row.mod_nombre,
        mod_ruta: row.mod_ruta,
        mod_icono: row.mod_icono,
        mod_posicion: Number(row.mod_posicion),
        mod_padre_id: row.mod_padre_id ? Number(row.mod_padre_id) : null,
        mod_activo: Boolean(row.mod_activo),
        permisos: {
          ver: Boolean(row.ver),
          crear: Boolean(row.crear),
          editar: Boolean(row.editar),
          eliminar: Boolean(row.eliminar),
          aprobar: Boolean(row.aprobar),
        },
        subModulos: [],
      };
      modulosMap.set(Number(row.mod_id), modulo);
      if (!row.mod_padre_id) {
        result.push(modulo);
      }
    });

    modulos.forEach((row) => {
      if (row.mod_padre_id) {
        const padre = modulosMap.get(Number(row.mod_padre_id));
        const hijo = modulosMap.get(Number(row.mod_id));
        if (padre && hijo) {
          padre.subModulos.push(hijo);
        }
      }
    });

    const tienePermiso = (modulo: any, permisos: string[]): boolean => {
      const tieneEnModulo = permisos.some(
        (p) => modulo.permisos[p as keyof typeof modulo.permisos],
      );
      const hijosConPermiso = modulo.subModulos?.some((hijo: any) =>
        tienePermiso(hijo, permisos),
      );
      return tieneEnModulo || hijosConPermiso;
    };

    return result.filter((m) =>
      tienePermiso(m, ['ver', 'crear', 'editar', 'eliminar', 'aprobar']),
    );
  }
}
