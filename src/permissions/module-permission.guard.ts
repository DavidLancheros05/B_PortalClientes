import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import {
  REQUIERE_PERMISO_KEY,
  RequierePermisoMeta,
} from './requiere-permiso.decorator';

// Mismo esqueleto que RolesGuard: si el handler no tiene @RequierePermiso,
// no hace nada (deja pasar). Requiere correr después de JwtAuthGuard, que es
// quien pone request.user a partir del JWT.
@Injectable()
export class ModulePermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequierePermisoMeta>(
      REQUIERE_PERMISO_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const tienePermiso = await this.permissionsService.tienePermiso(
      user,
      meta.ruta,
      meta.accion,
    );

    if (!tienePermiso) {
      throw new ForbiddenException(
        `No tienes permiso de "${meta.accion}" en ${meta.ruta}`,
      );
    }

    return true;
  }
}
