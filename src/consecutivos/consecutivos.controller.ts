import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ConsecutivosService } from './consecutivos.service';
import {
  CreateConsecutivoDto,
  UpdateConsecutivoDto,
  CreateTipoConsecutivoDto,
  UpdateTipoConsecutivoDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';

// Rutas de pc_modulos de las dos pantallas (seguridad/consecutivos/...).
const RUTA_CONSECUTIVOS = '/seguridad/consecutivos/consecutivos';
const RUTA_TIPOS = '/seguridad/consecutivos/tipo-consecutivo';

@Controller('consecutivos')
@UseGuards(JwtAuthGuard)
export class ConsecutivosController {
  constructor(private readonly consecutivosService: ConsecutivosService) {}

  @Get('tipos/test')
  async testTipos() {
    return { message: 'Tipos API funcionando' };
  }

  // Tipo Consecutivo endpoints (ANTES de rutas genéricas)
  @Get('tipos/all')
  @RequierePermiso(RUTA_TIPOS, 'ver')
  async findAllTipos() {
    return this.consecutivosService.findAllTipos();
  }

  @Get('tipos/:id')
  @RequierePermiso(RUTA_TIPOS, 'ver')
  async findTipoById(@Param('id') id: number) {
    return this.consecutivosService.findTipoById(id);
  }

  @Post('tipos')
  @RequierePermiso(RUTA_TIPOS, 'crear')
  async createTipo(@Body() dto: CreateTipoConsecutivoDto) {
    return this.consecutivosService.createTipo(dto);
  }

  @Put('tipos/:id')
  @RequierePermiso(RUTA_TIPOS, 'editar')
  async updateTipo(
    @Param('id') id: number,
    @Body() dto: UpdateTipoConsecutivoDto,
  ) {
    return this.consecutivosService.updateTipo(id, dto);
  }

  @Delete('tipos/:id')
  @RequierePermiso(RUTA_TIPOS, 'eliminar')
  async deleteTipo(@Param('id') id: number) {
    return this.consecutivosService.deleteTipo(id);
  }

  // Consecutivo endpoints (DESPUÉS de rutas específicas)
  @Get()
  @RequierePermiso(RUTA_CONSECUTIVOS, 'ver')
  async findAll() {
    return this.consecutivosService.findAll();
  }

  @Get(':id')
  @RequierePermiso(RUTA_CONSECUTIVOS, 'ver')
  async findById(@Param('id') id: number) {
    return this.consecutivosService.findById(id);
  }

  @Post()
  @RequierePermiso(RUTA_CONSECUTIVOS, 'crear')
  async create(@Body() dto: CreateConsecutivoDto) {
    return this.consecutivosService.create(dto);
  }

  @Put(':id')
  @RequierePermiso(RUTA_CONSECUTIVOS, 'editar')
  async update(@Param('id') id: number, @Body() dto: UpdateConsecutivoDto) {
    return this.consecutivosService.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso(RUTA_CONSECUTIVOS, 'eliminar')
  async delete(@Param('id') id: number) {
    return this.consecutivosService.delete(id);
  }
}
