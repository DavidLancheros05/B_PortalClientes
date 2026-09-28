import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { MaestrosService } from './maestros.service';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';

@Controller('maestros')
export class MaestrosController {
  constructor(private readonly maestrosService: MaestrosService) {}

  @Get('paises')
  getPaises() {
    return this.maestrosService.getPaises();
  }

  // ParseIntPipe: un valor no numérico ("abc") llegaba como NaN al SQL y
  // terminaba en 500; ahora es un 400 claro (y también si falta).
  @Get('departamentos')
  getDepartamentos(@Query('pais_id', ParseIntPipe) pais_id: number) {
    return this.maestrosService.getDepartamentos(pais_id);
  }

  @Get('ciudades')
  getCiudades(@Query('depto_id', ParseIntPipe) depto_id: number) {
    return this.maestrosService.getCiudades(depto_id);
  }

  @Get('catalogo')
  getCatalogo(
    @Query('tabla') tabla: string,
    @Query('base_datos') baseDatos?: string,
    @Query('columna_descripcion') columnaDescripcion?: string,
    @Query('columna_id') columnaId?: string,
    @Query('columna_filtro') columnaFiltro?: string,
    @Query('valor_filtro') valorFiltro?: string,
    @Query('columna_condicion') columnaCondicion?: string,
    @Query('valor_condicion') valorCondicion?: string,
  ) {
    return this.maestrosService.getCatalogo(
      tabla,
      baseDatos,
      columnaDescripcion,
      columnaId,
      columnaFiltro,
      valorFiltro,
      columnaCondicion,
      valorCondicion,
    );
  }

  @Get('catalogo-documentos')
  getCatalogoDocumentos(@Query('mode') mode?: 'options' | 'full') {
    return this.maestrosService.getCatalogoDocumentos(mode || 'options');
  }

  // Navegador genérico de esquema de BD (lista bases/tablas/columnas). Lo usa
  // el editor de formularios (usePreguntaEditor.ts) para configurar
  // preguntas tipo catálogo. El editor no tiene módulo propio: se abre desde
  // Formularios, y Preguntas configura lo mismo. Ver
  // documentacion/Portal Clientes/Login permisos/permisos-endpoints.md.
  @Get('catalogo-esquema')
  @RequierePermiso(
    ['/parametrizacion/formularios', '/parametrizacion/formulario-preguntas'],
    'editar',
  )
  getCatalogoEsquema(
    @Query('mode') mode: 'databases' | 'tables' | 'columns' = 'databases',
    @Query('base_datos') baseDatos?: string,
    @Query('tabla') tabla?: string,
    @Query('q') q?: string,
  ) {
    return this.maestrosService.getCatalogoEsquema(mode, baseDatos, tabla, q);
  }
}
