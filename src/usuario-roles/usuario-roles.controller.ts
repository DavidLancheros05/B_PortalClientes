import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';
import { UsuarioRolesService } from './usuario-roles.service';

@UseGuards(JwtAuthGuard)
@Controller('usuario-roles')
export class UsuarioRolesController {
  constructor(private readonly usuarioRolesService: UsuarioRolesService) {}

  @Get('usuarios')
  @RequierePermiso('/seguridad/usuario-roles', 'ver')
  async getAllUsuarios() {
    return await this.usuarioRolesService.getAllUsuarios();
  }

  @Get(':usuarioId')
  @RequierePermiso('/seguridad/usuario-roles', 'ver')
  async getByUsuario(@Param('usuarioId', ParseIntPipe) usuarioId: number) {
    return await this.usuarioRolesService.getByUsuario(usuarioId);
  }

  @Post(':usuarioId/:rolId')
  @RequierePermiso('/seguridad/usuario-roles', 'crear')
  async assignRole(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Param('rolId', ParseIntPipe) rolId: number,
  ) {
    return await this.usuarioRolesService.assignRole(usuarioId, rolId);
  }

  @Delete(':usuarioId/:rolId')
  @RequierePermiso('/seguridad/usuario-roles', 'eliminar')
  async removeRole(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Param('rolId', ParseIntPipe) rolId: number,
  ) {
    return await this.usuarioRolesService.removeRole(usuarioId, rolId);
  }
}
