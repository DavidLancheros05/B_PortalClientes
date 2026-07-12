import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FormularioSeccionesService } from './formulario-secciones.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface CreateSeccionDto {
  seccion_nombre: string;
  seccion_descripcion?: string;
  seccion_orden: number;
  seccion_oculta_en_formulario?: boolean;
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

  @Get()
  async listar() {
    return await this.formularioSeccionesService.listar();
  }

  @Post()
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
  async actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSeccionDto,
  ) {
    return await this.formularioSeccionesService.actualizar(id, dto);
  }

  @Delete(':id')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    const eliminado = await this.formularioSeccionesService.eliminar(id);
    if (!eliminado) {
      throw new HttpException('Sección no encontrada', HttpStatus.NOT_FOUND);
    }
    return { success: true, message: 'Sección eliminada exitosamente' };
  }
}
