import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { SolicitudEstadosService } from './solicitud-estados.service';

// Solo lectura: `solicitud_estados` no tiene pantalla de administración
// propia (se edita directo en BD, igual que Festivos), así que no hace
// falta CRUD acá — solo exponer el catálogo para que el frontend deje de
// mantener una copia hardcodeada.
@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/solicitud-estados')
export class SolicitudEstadosController {
  constructor(private readonly solicitudEstadosService: SolicitudEstadosService) {}

  @Get()
  async listar() {
    return this.solicitudEstadosService.obtenerTodos();
  }
}
