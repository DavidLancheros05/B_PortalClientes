import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  async obtenerPlantillas() {
    try {
      return await this.notificacionesService.obtenerPlantillas();
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Error al obtener plantillas',
        500,
      );
    }
  }

  @Put(':codigo')
  async crearOActualizarPlantilla(
    @Param('codigo') codigo: string,
    @Body() body: any,
  ) {
    try {
      return await this.notificacionesService.crearOActualizarPlantilla(
        codigo,
        body,
      );
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Error al actualizar plantilla',
        500,
      );
    }
  }
}
