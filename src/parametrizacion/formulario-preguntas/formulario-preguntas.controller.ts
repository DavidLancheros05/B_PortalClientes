import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  ParseIntPipe,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequierePermiso } from '../../permissions/requiere-permiso.decorator';
import { FormularioPreguntasService } from './formulario-preguntas.service';
import { OpcionesService } from '../opciones/opciones.service';
import { CreateFormularioPreguntaDto } from './dto/create-formulario-pregunta.dto';
import { UpdateFormularioPreguntaDto } from './dto/update-formulario-pregunta.dto';
import { CreateFormularioPreguntaOpcionDto } from '../opciones/dto/create-formulario-pregunta-opcion.dto';
import { UpdateFormularioPreguntaOpcionDto } from '../opciones/dto/update-formulario-pregunta-opcion.dto';

@Controller('parametrizacion/formulario-preguntas')
export class FormularioPreguntasController {
  constructor(
    private readonly service: FormularioPreguntasService,
    private readonly opcionesService: OpcionesService,
  ) {}

  @Post()
  @RequierePermiso('/parametrizacion/formulario-preguntas', 'crear')
  create(@Body() dto: CreateFormularioPreguntaDto) {
    return this.service.create(dto);
  }

  @Get('activas')
  async getPreguntasActivas() {
    return this.service.findAll(undefined, undefined, true);
  }

  @UseGuards(JwtAuthGuard)
  @Get('formulario-activo')
  async getPreguntasFormularioActivo() {
    return this.service.findPreguntasFormularioActivo();
  }

  // Vista de solo lectura de "preguntas reservadas" (ver
  // preguntas-protegidas.constant.ts) — pantalla propia en Parametrización
  // para que alguien sin acceso a TypeScript/BD pueda ver qué preguntas
  // están ancladas al flujo del portal o al envío a SIESA, y por qué.
  @RequierePermiso('/parametrizacion/formulario-preguntas-reservadas', 'ver')
  @Get('reservadas')
  async getReservadas() {
    return this.service.findReservadas();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('formularioId') formularioId?: string,
    @Query('version') version?: string,
    @Query('soloActivas') soloActivas: string = 'true',
  ) {
    const formularioIdNum = formularioId ? parseInt(formularioId) : undefined;
    const versionNum = version ? parseInt(version) : undefined;
    const soloActivasFlag = soloActivas !== 'false';

    return this.service.findAll(formularioIdNum, versionNum, soloActivasFlag);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/opciones')
  getOpciones(@Param('id') id: number) {
    return this.opcionesService.findByPregunta(+id);
  }

  @Post(':id/opciones')
  @RequierePermiso('/parametrizacion/formulario-preguntas', 'crear')
  createOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFormularioPreguntaOpcionDto,
  ) {
    dto.fpo_fp_id = id;
    return this.opcionesService.create(dto);
  }

  @Put(':id/opciones/:opcionId')
  @RequierePermiso('/parametrizacion/formulario-preguntas', 'editar')
  async updateOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Param('opcionId', ParseIntPipe) opcionId: number,
    @Body() dto: UpdateFormularioPreguntaOpcionDto,
  ) {
    try {
      return await this.opcionesService.update(opcionId, dto);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al editar opción',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id/opciones/:opcionId')
  @RequierePermiso('/parametrizacion/formulario-preguntas', 'eliminar')
  async deleteOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Param('opcionId', ParseIntPipe) opcionId: number,
  ) {
    try {
      return await this.opcionesService.remove(opcionId);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al eliminar opción',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  @RequierePermiso('/parametrizacion/formulario-preguntas', 'editar')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateFormularioPreguntaDto,
  ) {
    try {
      return await this.service.update(+id, dto);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al editar pregunta',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':id')
  @RequierePermiso('/parametrizacion/formulario-preguntas', 'eliminar')
  async remove(@Param('id') id: number) {
    try {
      return await this.service.remove(+id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al eliminar pregunta',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
