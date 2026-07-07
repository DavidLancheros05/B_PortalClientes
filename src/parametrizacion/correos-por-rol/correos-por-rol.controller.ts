import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { CorreosPorRolService } from './correos-por-rol.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/correos-por-rol')
export class CorreosPorRolController {
  constructor(private readonly correosPorRolService: CorreosPorRolService) {}

  @Get('roles')
  async getRolesActivos() {
    try {
      return await this.correosPorRolService.getRolesActivos();
    } catch (error: any) {
      throw new HttpException(error.message || 'Error cargando roles', 500);
    }
  }

  @Get()
  async getCorreosPorRol() {
    try {
      return await this.correosPorRolService.getCorreosPorRol();
    } catch (error: any) {
      throw new HttpException(error.message || 'Error cargando correos', 500);
    }
  }

  @Post()
  async crearCorreoPorRol(@Body() body: { rol_id: number; email: string }) {
    try {
      if (!body.rol_id || !body.email) {
        throw new Error('Faltan campos requeridos');
      }

      return await this.correosPorRolService.crearCorreoPorRol({
        rol_id: Number(body.rol_id),
        email: body.email,
      });
    } catch (error: any) {
      throw new HttpException(error.message || 'Error creando correo', 400);
    }
  }

  @Put(':id')
  async actualizarCorreoPorRol(
    @Param('id', ParseIntPipe) correoId: number,
    @Body() body: { email: string },
  ) {
    try {
      if (!correoId) {
        throw new Error('id invalido');
      }

      if (!body.email) {
        throw new Error('Email requerido');
      }

      return await this.correosPorRolService.actualizarCorreoPorRol(correoId, {
        email: body.email,
      });
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Error actualizando correo',
        500,
      );
    }
  }

  @Patch(':id/estado')
  async actualizarEstadoCorreoPorRol(
    @Param('id', ParseIntPipe) correoId: number,
    @Body() body: { activo: boolean },
  ) {
    try {
      if (!correoId) {
        throw new Error('id invalido');
      }

      if (typeof body.activo !== 'boolean') {
        throw new Error('Estado requerido');
      }

      return await this.correosPorRolService.actualizarEstadoCorreoPorRol(
        correoId,
        body.activo,
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Error actualizando estado',
        500,
      );
    }
  }
}
