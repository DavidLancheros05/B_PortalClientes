// src/documentos/documentos.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { DocumentosService } from './documentos.service';
import { Documento } from './tipos-documetos/entities/documento.entity';
import { CreateDocumentoDto } from './dto/create-documento.dto';
import { UpdateDocumentoDto } from './dto/update-documento.dto';

@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

  @Get()
  findAll(): Promise<Documento[]> {
    return this.documentosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Documento> {
    return this.documentosService.findOne(Number(id));
  }

  @Post()
  create(@Body() createDto: CreateDocumentoDto): Promise<Documento> {
    return this.documentosService.create(createDto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateDocumentoDto,
  ): Promise<Documento> {
    return this.documentosService.update(Number(id), updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.documentosService.remove(Number(id));
  }
}
