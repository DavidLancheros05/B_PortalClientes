import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { IndicadoresService } from './indicadores.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('indicadores')
export class IndicadoresController {
  constructor(private readonly indicadoresService: IndicadoresService) {}

  @Get('cumplimiento')
  async getCumplimiento(
    @Query()
    query: {
      fecha_desde?: string;
      fecha_hasta?: string;
    },
  ) {
    try {
      return await this.indicadoresService.getCumplimiento(query);
    } catch (error: any) {
      return {
        message: error.message || 'Error interno consultando indicadores',
        error: String(error),
      };
    }
  }

  @Get('solicitud')
  async getSolicitudTimeline(
    @Query() query: { numero?: string; sol_id?: string },
  ) {
    try {
      const result = await this.indicadoresService.getSolicitudTimeline(query);
      if (!result) return { message: 'Solicitud no encontrada' };
      return result;
    } catch (error: any) {
      return { message: error.message || 'Error consultando solicitud' };
    }
  }

  @Get('solicitudes')
  async getListadoSla(
    @Query()
    query: {
      numero?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      estado?: string;
      sla?: 'vencida' | 'en_riesgo' | 'a_tiempo';
    },
  ) {
    try {
      return await this.indicadoresService.getListadoSla(query);
    } catch (error: any) {
      return {
        message: error.message || 'Error interno consultando el listado de SLA',
        error: String(error),
      };
    }
  }

  @Get('detalle')
  async getDetalleArea(
    @Query()
    query: {
      area: string;
      fecha_desde?: string;
      fecha_hasta?: string;
    },
  ) {
    if (!query.area)
      throw new BadRequestException('El parámetro area es requerido');
    try {
      return await this.indicadoresService.getDetalleArea(query);
    } catch (error: any) {
      return {
        message: error.message || 'Error interno consultando detalle',
        error: String(error),
      };
    }
  }
}
