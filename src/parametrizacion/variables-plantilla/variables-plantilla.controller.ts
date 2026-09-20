import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { VariablesPlantillaService } from './variables-plantilla.service';
import { CreateVariablePlantillaDto } from './dto/create-variable-plantilla.dto';
import { UpdateVariablePlantillaDto } from './dto/update-variable-plantilla.dto';
import { RequierePermiso } from '../../permissions/requiere-permiso.decorator';

@Controller('parametrizacion/variables-plantilla')
export class VariablesPlantillaController {
  constructor(private readonly service: VariablesPlantillaService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  // Rutas fijas (columnas/resolver) van ANTES de ':id' para que Nest no las
  // confunda con el param dinámico.
  @Get('columnas')
  getColumnas(@Query('tabla') tabla: string) {
    if (!tabla) throw new BadRequestException('El parámetro tabla es requerido');
    return this.service.getColumnas(tabla);
  }

  @Get('resolver')
  resolver(@Query('solicitud_id') solicitudId: string) {
    if (!solicitudId)
      throw new BadRequestException('El parámetro solicitud_id es requerido');
    return this.service.resolverParaSolicitud(+solicitudId);
  }

  @Post()
  @RequierePermiso('/parametrizacion/variables-plantilla', 'crear')
  create(@Body() dto: CreateVariablePlantillaDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequierePermiso('/parametrizacion/variables-plantilla', 'editar')
  update(@Param('id') id: string, @Body() dto: UpdateVariablePlantillaDto) {
    return this.service.update(+id, dto);
  }

  @Patch(':id/estado')
  @RequierePermiso('/parametrizacion/variables-plantilla', 'editar')
  cambiarEstado(@Param('id') id: string, @Body() body: { pvp_estado: boolean }) {
    return this.service.cambiarEstado(+id, body.pvp_estado);
  }

  @Delete(':id')
  @RequierePermiso('/parametrizacion/variables-plantilla', 'eliminar')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
