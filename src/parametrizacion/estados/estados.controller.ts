import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { EstadosService } from './estados.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/estados')
export class EstadosController {
  constructor(private readonly estadosService: EstadosService) {}

  @Get()
  async getEstados() {
    try {
      return await this.estadosService.getEstados();
    } catch (error: any) {
      throw new HttpException(error.message || 'Error al obtener estados', 500);
    }
  }

  @Post()
  async crearEstado(
    @Body() body: { codigo: string; descripcion: string; orden: number },
  ) {
    try {
      return await this.estadosService.crearEstado(body);
    } catch (error: any) {
      throw new HttpException(error.message || 'Error al crear estado', 400);
    }
  }

  @Put(':estadoId')
  async actualizarEstado(
    @Param('estadoId', ParseIntPipe) estadoId: number,
    @Body() body: { codigo: string; descripcion: string; orden: number },
  ) {
    try {
      return await this.estadosService.actualizarEstado(estadoId, body);
    } catch (error: any) {
      throw new HttpException(
        error.message || 'Error al actualizar estado',
        500,
      );
    }
  }

  @Delete(':estadoId')
  async eliminarEstado(@Param('estadoId', ParseIntPipe) estadoId: number) {
    try {
      return await this.estadosService.eliminarEstado(estadoId);
    } catch (error: any) {
      throw new HttpException(error.message || 'Error al eliminar estado', 500);
    }
  }
}
