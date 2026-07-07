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

@Controller('parametrizacion/tipos-documentos')
export class TiposDocumentosController {
  constructor(
    private readonly tiposDocumentosService: TiposDocumentosService,
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
}
