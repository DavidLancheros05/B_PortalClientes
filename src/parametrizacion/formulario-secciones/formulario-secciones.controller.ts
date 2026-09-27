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
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FormularioSeccionesService } from './formulario-secciones.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequierePermiso } from '../../permissions/requiere-permiso.decorator';

// Secciones: su propia pantalla y el editor de formularios (que se abre
// desde Formularios). Hoy solo ADMIN tiene permiso.
const RUTAS_SECCIONES = [
  '/parametrizacion/formulario-secciones',
  '/parametrizacion/formularios',
];

interface CreateSeccionDto {
  seccion_nombre: string;
  seccion_descripcion?: string;
  seccion_orden: number;
  seccion_oculta_en_formulario?: boolean;
  // Versión a la que pertenece. Si no vienen, la versión activa del
  // formulario activo (lo que hacía siempre la pantalla global).
  formulario_id?: number;
  formulario_version?: number;
}

interface UpdateSeccionDto {
  seccion_nombre?: string;
  seccion_descripcion?: string;
  seccion_orden?: number;
  seccion_activo?: boolean;
  seccion_oculta_en_formulario?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/formulario-secciones')
export class FormularioSeccionesController {
  constructor(
    private readonly formularioSeccionesService: FormularioSeccionesService,
  ) {}

  @Get('formulario-activo')
  async listarFormularioActivo() {
    return await this.formularioSeccionesService.listarFormularioActivo();
  }

  @Get()
  async listar(
    @Query('formularioId') formularioId?: string,
    @Query('version') version?: string,
  ) {
    return await this.formularioSeccionesService.listar(
      formularioId ? parseInt(formularioId) : undefined,
      version ? parseInt(version) : undefined,
    );
  }

  @Post()
  @RequierePermiso(RUTAS_SECCIONES, 'crear')
  async crear(@Body() dto: CreateSeccionDto) {
    if (!dto.seccion_nombre || !dto.seccion_nombre.trim()) {
      throw new HttpException(
        'El nombre de la sección es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.seccion_orden === undefined) {
      throw new HttpException(
        'El orden de la sección es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this.formularioSeccionesService.crear(dto);
  }

  @Put(':id')
  @RequierePermiso(RUTAS_SECCIONES, 'editar')
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSeccionDto,
  ) {
    return await this.formularioSeccionesService.actualizar(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(RUTAS_SECCIONES, 'eliminar')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    const eliminado = await this.formularioSeccionesService.eliminar(id);
    if (!eliminado) {
      throw new HttpException('Sección no encontrada', HttpStatus.NOT_FOUND);
    }
    return { success: true, message: 'Sección eliminada exitosamente' };
  }
}
