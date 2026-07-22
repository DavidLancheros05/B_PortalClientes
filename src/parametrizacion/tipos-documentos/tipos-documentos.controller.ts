import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TiposDocumentosService } from './tipos-documentos.service';
import { CreateTipoDocumentoDto } from './dto/create-tipo-documento.dto';
import { UpdateTipoDocumentoDto } from './dto/update-tipo-documento.dto';
import { RevisionesDocumentosService } from '../revisiones-documentos/revisiones-documentos.service';
import { CreateTipoDocumentoRevisionDto } from '../revisiones-documentos/dto/create-tipo-documento-revision.dto';
import { UpdateTipoDocumentoRevisionDto } from '../revisiones-documentos/dto/update-tipo-documento-revision.dto';

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
  create(@Body() createDto: CreateTipoDocumentoDto) {
    return this.tiposDocumentosService.create(createDto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTipoDocumentoDto,
  ) {
    return this.tiposDocumentosService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tiposDocumentosService.remove(id);
  }

  // ===== Historial de revisiones (tabla "Revisión / Descripción del
  // Cambio / Fecha" del formato oficial) =====

  @Get(':id/revisiones')
  getRevisiones(@Param('id', ParseIntPipe) id: number) {
    return this.revisionesService.findByTipoDocumento(id);
  }

  @Post(':id/revisiones')
  createRevision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTipoDocumentoRevisionDto,
  ) {
    dto.tipoDocumentoId = id;
    return this.revisionesService.create(dto);
  }

  @Patch(':id/revisiones/:revisionId')
  updateRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
    @Body() dto: UpdateTipoDocumentoRevisionDto,
  ) {
    return this.revisionesService.update(revisionId, dto);
  }

  @Delete(':id/revisiones/:revisionId')
  removeRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revisionId', ParseIntPipe) revisionId: number,
  ) {
    return this.revisionesService.remove(revisionId);
  }
}
