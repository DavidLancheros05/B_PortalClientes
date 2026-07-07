import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user?.rol) {
      throw new ForbiddenException('Sin rol asignado');
    }

    if (!requiredRoles.includes(user.rol)) {
      throw new ForbiddenException(
        `Se requiere uno de los roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
