import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TiposDocumentosService } from './tipos-documentos.service';
import { CreateTipoDocumentoDto } from './dto/create-tipo-documento.dto';
import { UpdateTipoDocumentoDto } from './dto/update-tipo-documento.dto';
import { RevisionesDocumentosService } from '../revisiones-documentos/revisiones-documentos.service';
import { CreateTipoDocumentoRevisionDto } from '../revisiones-documentos/dto/create-tipo-documento-revision.dto';
import { UpdateTipoDocumentoRevisionDto } from '../revisiones-documentos/dto/update-tipo-documento-revision.dto';
import { RequierePermiso } from '../../permissions/requiere-permiso.decorator';

// Ojo: la ruta de menú real en pc_modulos es '/parametrizacion/documentos'
// (mod_id 78, "Tipos de Documentos"), NO '/parametrizacion/tipos-documentos'
// como el path de este controller — confirmado contra la BD antes de decorar.
@Controller('parametrizacion/tipos-documentos')
export class TiposDocumentosController {
  constructor(
    private readonly tiposDocumentosService: TiposDocumentosService,
    private readonly revisionesService: RevisionesDocumentosService,
  ) {}

  @Get()
  findAll(@Query('activo') activo?: string) {
    const onlyActive = activo === '1' || activo === 'true';
    return this.tiposDocumentosService.findAll(onlyActive);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tiposDocumentosService.findOne(id);
  }

  @Post()
  @RequierePermiso('/parametrizacion/documentos', 'crear')
  create(@Body() createDto: CreateTipoDocumentoDto) {
    return this.tiposDocumentosService.create(createDto);
  }

  @Patch(':id')
  @RequierePermiso('/parametrizacion/documentos', 'editar')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTipoDocumentoDto,
  ) {
    return this.tiposDocumentosService.update(id, updateDto);
  }

  @Delete(':id')
  @RequierePermiso('/parametrizacion/documentos', 'eliminar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tiposDocumentosService.remove(id);
  }

  // Imagen de encabezado (tdo_encabezado_tipo = 'IMAGEN') — se dibuja arriba
  // de cada página del PDF de documentos de origen CARTA_APROBACION en vez
  // de la tabla de "formato oficial" completa (ver
  // common/utils/carta-pdf.util.ts::resolverEncabezadoDocumento).
  @Post(':id/encabezado-imagen')
  @RequierePermiso('/parametrizacion/documentos', 'editar')
  @UseInterceptors(FileInterceptor('archivo'))
  async subirEncabezadoImagen(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    return this.tiposDocumentosService.subirEncabezadoImagen(id, file);
  }

  // Imagen de pie de página (tdo_pie_pagina_tipo = 'IMAGEN') — se dibuja
  // abajo de cada página del PDF de documentos de origen CLIENTE con
  // tipoPlantilla='TEXTO' (frontend, pdf-lib, carta-pdf.util.ts).
  @Post(':id/pie-pagina-imagen')
  @RequierePermiso('/parametrizacion/documentos', 'editar')
  @UseInterceptors(FileInterceptor('archivo'))
  async subirPiePaginaImagen(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    return this.tiposDocumentosService.subirPiePaginaImagen(id, file);
  }

  // ===== Historial de revisiones (tabla "Revisión / Descripción del
  // Cambio / Fecha" del formato oficial) =====

  @Get(':id/revisiones')
  getRevisiones(@Param('id', ParseIntPipe) id: number) {
    return this.revisionesService.findByTipoDocumento(id);
  }

  @Post(':id/revisiones')
  @RequierePermiso('/parametrizacion/documentos', 'crear')
  createRevision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTipoDocumentoRevisionDto,
  ) {
    dto.tipoDocumentoId = id;
    return this.revisionesService.create(dto);
  }

  @Patch(':id/revisiones/:revisionId')
  @RequierePermiso('/parametrizacion/documentos', 'editar')
  updateRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
    @Body() dto: UpdateTipoDocumentoRevisionDto,
  ) {
    return this.revisionesService.update(revisionId, dto);
  }

  @Delete(':id/revisiones/:revisionId')
  @RequierePermiso('/parametrizacion/documentos', 'eliminar')
  removeRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ) {
    return this.revisionesService.remove(revisionId);
  }
}
