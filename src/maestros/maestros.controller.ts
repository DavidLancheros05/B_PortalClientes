import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { MaestrosService } from './maestros.service';

@Controller('maestros')
export class MaestrosController {
  constructor(private readonly maestrosService: MaestrosService) {}

  @Get('paises')
  getPaises() {
    return this.maestrosService.getPaises();
  }

  @Get('departamentos')
  getDepartamentos(@Query('pais_id') pais_id: string) {
    if (!pais_id) throw new BadRequestException('pais_id es requerido');
    return this.maestrosService.getDepartamentos(parseInt(pais_id, 10));
  }

  @Get('ciudades')
  getCiudades(@Query('depto_id') depto_id: string) {
    if (!depto_id) throw new BadRequestException('depto_id es requerido');
    return this.maestrosService.getCiudades(parseInt(depto_id, 10));
  }

  @Get('catalogo')
  getCatalogo(
    @Query('tabla') tabla: string,
    @Query('base_datos') baseDatos?: string,
    @Query('columna_descripcion') columnaDescripcion?: string,
    @Query('columna_id') columnaId?: string,
    @Query('columna_filtro') columnaFiltro?: string,
    @Query('valor_filtro') valorFiltro?: string,
  ) {
    return this.maestrosService.getCatalogo(
      tabla,
      baseDatos,
      columnaDescripcion,
      columnaId,
      columnaFiltro,
      valorFiltro,
    );
  }

  @Get('catalogo-documentos')
  getCatalogoDocumentos(@Query('mode') mode?: 'options' | 'full') {
    return this.maestrosService.getCatalogoDocumentos(mode || 'options');
  }

  @Get('catalogo-esquema')
  getCatalogoEsquema(
    @Query('mode') mode: 'databases' | 'tables' | 'columns' = 'databases',
    @Query('base_datos') baseDatos?: string,
    @Query('tabla') tabla?: string,
    @Query('q') q?: string,
  ) {
    return this.maestrosService.getCatalogoEsquema(mode, baseDatos, tabla, q);
  }
}
