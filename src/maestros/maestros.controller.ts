import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { MaestrosService } from './maestros.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

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

  // Navegador genérico de esquema de BD (lista bases/tablas/columnas y
  // ejecuta SELECT arbitrarios vía getCatalogo). Confirmado que ningún
  // GET /maestros/catalogo-esquema/page.tsx del frontend lo consume — es
  // herramienta de debug huérfana, no una función de negocio (a diferencia
  // de getCatalogo, que sí usa el formulario real para preguntas tipo
  // catálogo). Ver documentacion/Portal Clientes/Login permisos/permisos-endpoints.md.
  @Get('catalogo-esquema')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  getCatalogoEsquema(
    @Query('mode') mode: 'databases' | 'tables' | 'columns' = 'databases',
    @Query('base_datos') baseDatos?: string,
    @Query('tabla') tabla?: string,
    @Query('q') q?: string,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'catalogo-esquema es una herramienta de desarrollo, deshabilitada en producción',
      );
    }
    return this.maestrosService.getCatalogoEsquema(mode, baseDatos, tabla, q);
  }
}
