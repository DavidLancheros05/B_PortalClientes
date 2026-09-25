import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { SeguridadService } from './seguridad.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';

// Los errores con status propio (400 validación, 404, 409 código repetido)
// pasan tal cual; solo lo inesperado se reporta como 500. Antes todo salía
// como 500, incluso "el nombre es obligatorio".
const relanzar = (error: any, mensaje: string): never => {
  if (error instanceof HttpException) throw error;
  throw new HttpException(error?.message || mensaje, 500);
};

@UseGuards(JwtAuthGuard)
@Controller('seguridad')
export class SeguridadController {
  constructor(private readonly seguridadService: SeguridadService) {}

  @Get('roles')
  async getRoles(@Query('incluirInactivos') incluirInactivos?: string) {
    try {
      return await this.seguridadService.getRoles(
        incluirInactivos === 'true' || incluirInactivos === '1',
      );
    } catch (error: any) {
      relanzar(error, 'Error cargando roles');
    }
  }

  @Post('roles')
  @RequierePermiso('/seguridad/roles', 'crear')
  async crearRol(@Body() body: any) {
    try {
      return await this.seguridadService.crearRol(body);
    } catch (error: any) {
      relanzar(error, 'Error creando rol');
    }
  }

  @Put('roles/:rolId')
  @RequierePermiso('/seguridad/roles', 'editar')
  async actualizarRol(
    @Param('rolId', ParseIntPipe) rolId: number,
    @Body() body: any,
  ) {
    try {
      return await this.seguridadService.actualizarRol(rolId, body);
    } catch (error: any) {
      relanzar(error, 'Error actualizando rol');
    }
  }

  @Delete('roles/:rolId')
  @RequierePermiso('/seguridad/roles', 'eliminar')
  async inactivarRol(@Param('rolId', ParseIntPipe) rolId: number) {
    try {
      return await this.seguridadService.inactivarRol(rolId);
    } catch (error: any) {
      relanzar(error, 'Error inactivando rol');
    }
  }
}
