import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { SeguridadService } from './seguridad.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';

@UseGuards(JwtAuthGuard)
@Controller('seguridad')
export class SeguridadController {
  constructor(private readonly seguridadService: SeguridadService) {}

  @Get('roles')
  async getRoles() {
    try {
      return await this.seguridadService.getRoles();
    } catch (error: any) {
      throw new HttpException(error.message || 'Error cargando roles', 500);
    }
  }

  @Post('roles')
  @RequierePermiso('/seguridad/roles', 'crear')
  async crearRol(@Body() body: any) {
    try {
      return await this.seguridadService.crearRol(body);
    } catch (error: any) {
      throw new HttpException(error.message || 'Error creando rol', 500);
    }
  }

  @Put('roles/:rolId')
  @RequierePermiso('/seguridad/roles', 'editar')
  async actualizarRol(
    @Param('rolId', ParseIntPipe) rolId: number,
    @Body() body: any,
  ) {
    try {
      if (!rolId) {
        throw new Error('rol_id inválido');
      }

      return await this.seguridadService.actualizarRol(rolId, body);
    } catch (error: any) {
      throw new HttpException(error.message || 'Error actualizando rol', 500);
    }
  }

  @Delete('roles/:rolId')
  @RequierePermiso('/seguridad/roles', 'eliminar')
  async inactivarRol(@Param('rolId', ParseIntPipe) rolId: number) {
    try {
      if (!rolId) {
        throw new Error('rol_id inválido');
      }

      return await this.seguridadService.inactivarRol(rolId);
    } catch (error: any) {
      throw new HttpException(error.message || 'Error inactivando rol', 500);
    }
  }

}
