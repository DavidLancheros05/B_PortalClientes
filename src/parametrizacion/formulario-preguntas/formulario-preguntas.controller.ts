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
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
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
  create(@Body() dto: CreateFormularioPreguntaDto) {
    return this.service.create(dto);
  }

  @Get('activas')
  async getPreguntasActivas() {
    return this.service.findAll(undefined, undefined, true);
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
  createOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateFormularioPreguntaOpcionDto,
  ) {
    dto.fpo_fp_id = id;
    return this.opcionesService.create(dto);
  }

  @Put(':id/opciones/:opcionId')
  updateOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Param('opcionId', ParseIntPipe) opcionId: number,
    @Body() dto: UpdateFormularioPreguntaOpcionDto,
  ) {
    return this.opcionesService.update(opcionId, dto);
  }

  @Delete(':id/opciones/:opcionId')
  deleteOpcion(
    @Param('id', ParseIntPipe) id: number,
    @Param('opcionId', ParseIntPipe) opcionId: number,
  ) {
    return this.opcionesService.remove(opcionId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: number) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateFormularioPreguntaDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: number) {
    return this.service.remove(+id);
  }
}
