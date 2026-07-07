import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FormulariosService } from './formularios.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

interface CreateFormularioDto {
  formulario_nombre: string;
  formulario_descripcion?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/formularios')
export class FormulariosController {
  constructor(private readonly formulariosService: FormulariosService) {}

  @Get('activo')
  async obtenerActivo() {
    return this.formulariosService.obtenerActivo();
  }

  @Get()
  async listar(
    @Query('busqueda') busqueda?: string,
    @Query('estado') estado?: 'ACTIVO' | 'INACTIVO' | 'TODOS',
  ) {
    return this.formulariosService.listar(busqueda, estado);
  }

  @Get(':id/completo')
  async getFormularioCompleto(
    @Param('id', ParseIntPipe) id: number,
    @Query('version') version?: string,
  ) {
    const resultado = await this.formulariosService.getFormularioCompleto(
      id,
      version,
    );
    if (!resultado) {
      throw new HttpException('Formulario no encontrado', HttpStatus.NOT_FOUND);
    }
    return resultado;
  }

  @Get(':id')
  async obtenerPorId(@Param('id', ParseIntPipe) id: number) {
    const formulario = await this.formulariosService.obtenerPorId(id);
    if (!formulario) {
      throw new HttpException('Formulario no encontrado', HttpStatus.NOT_FOUND);
    }
    return formulario;
  }

  @Post()
  async crear(@Body() dto: CreateFormularioDto) {
    if (!dto.formulario_nombre || !dto.formulario_nombre.trim()) {
      throw new HttpException(
        'El nombre del formulario es requerido',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.formulariosService.crear(
      dto.formulario_nombre,
      dto.formulario_descripcion,
    );
  }

  @Delete(':id')
  async eliminar(@Param('id', ParseIntPipe) id: number) {
    const eliminado = await this.formulariosService.eliminar(id);
    if (!eliminado) {
      throw new HttpException('Formulario no encontrado', HttpStatus.NOT_FOUND);
    }
    return { success: true, message: 'Formulario eliminado exitosamente' };
  }

  @Get(':id/versiones')
  async obtenerVersiones(@Param('id', ParseIntPipe) id: number) {
    const resultado = await this.formulariosService.obtenerVersiones(id);
    if (!resultado) {
      throw new HttpException('Formulario no encontrado', HttpStatus.NOT_FOUND);
    }
    return resultado;
  }

  @Patch(':id/activar-version')
  async activarVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { versionNumero: number },
  ) {
    try {
      return await this.formulariosService.activarVersion(
        id,
        body.versionNumero,
      );
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al activar versión',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id/versiones/:versionNumero')
  async eliminarVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionNumero', ParseIntPipe) versionNumero: number,
  ) {
    try {
      return await this.formulariosService.eliminarVersion(id, versionNumero);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al eliminar versión',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/nueva-version')
  async crearNuevaVersion(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      descripcion?: string;
      copiarDeVersion?: number;
      usuarioId?: number;
    },
  ) {
    try {
      return await this.formulariosService.crearNuevaVersion(id, body);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al crear nueva versión',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
