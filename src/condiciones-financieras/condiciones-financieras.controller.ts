import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CondicionesFinancierasService } from './condiciones-financieras.service';
import { CondicionFinanciera } from './condicion-financiera.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';

// No tiene pantalla/módulo propio en pc_modulos — es parte del flujo de
// aprobación en Comité de Crédito 2 (cupo/plazo/forma de pago se fijan ahí,
// ver solicitudes.controller.ts::concepto-comite-credito-2). Hereda el
// mismo permiso que esa acción en vez de inventar un módulo nuevo.
@UseGuards(JwtAuthGuard)
@Controller('condiciones-financieras')
export class CondicionesFinancierasController {
  constructor(private readonly service: CondicionesFinancierasService) {}

  @Get()
  findAll(): Promise<CondicionFinanciera[]> {
    return this.service.findAll();
  }

  // Debe declararse antes de @Get(':id') para que "formas-pago" no
  // caiga en el ParseIntPipe de esa ruta
  @Get('formas-pago')
  getFormasPago() {
    return this.service.getFormasPago();
  }

  @Get('solicitud/:solicitudId')
  findBySolicitud(@Param('solicitudId', ParseIntPipe) solicitudId: number) {
    return this.service.findBySolicitud(solicitudId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequierePermiso('/solicitudes/gestion-comite-credito-2', 'aprobar')
  create(@Body() body: Partial<CondicionFinanciera>) {
    return this.service.create(body);
  }

  @Patch(':id')
  @RequierePermiso('/solicitudes/gestion-comite-credito-2', 'aprobar')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CondicionFinanciera>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequierePermiso('/solicitudes/gestion-comite-credito-2', 'aprobar')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
