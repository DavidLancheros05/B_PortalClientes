import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  BadRequestException,
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
  // catálogo). Ver documentacion/auditoria-permisos-endpoints-backend.md.
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
