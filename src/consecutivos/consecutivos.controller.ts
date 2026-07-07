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
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('consecutivos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsecutivosController {
  constructor(private readonly consecutivosService: ConsecutivosService) {}

  @Get('tipos/test')
  async testTipos() {
    return { message: 'Tipos API funcionando' };
  }

  // Tipo Consecutivo endpoints (ANTES de rutas genéricas)
  @Get('tipos/all')
  @Roles('ADMIN', 'ADMINISTRACION')
  async findAllTipos() {
    return this.consecutivosService.findAllTipos();
  }

  @Get('tipos/:id')
  @Roles('ADMIN', 'ADMINISTRACION')
  async findTipoById(@Param('id') id: number) {
    return this.consecutivosService.findTipoById(id);
  }

  @Post('tipos')
  @Roles('ADMIN', 'ADMINISTRACION')
  async createTipo(@Body() dto: CreateTipoConsecutivoDto) {
    return this.consecutivosService.createTipo(dto);
  }

  @Put('tipos/:id')
  @Roles('ADMIN', 'ADMINISTRACION')
  async updateTipo(
    @Param('id') id: number,
    @Body() dto: UpdateTipoConsecutivoDto,
  ) {
    return this.consecutivosService.updateTipo(id, dto);
  }

  @Delete('tipos/:id')
  @Roles('ADMIN')
  async deleteTipo(@Param('id') id: number) {
    return this.consecutivosService.deleteTipo(id);
  }

  // Consecutivo endpoints (DESPUÉS de rutas específicas)
  @Get()
  @Roles('ADMIN', 'ADMINISTRACION')
  async findAll() {
    return this.consecutivosService.findAll();
  }

  @Get(':id')
  @Roles('ADMIN', 'ADMINISTRACION')
  async findById(@Param('id') id: number) {
    return this.consecutivosService.findById(id);
  }

  @Post()
  @Roles('ADMIN', 'ADMINISTRACION')
  async create(@Body() dto: CreateConsecutivoDto) {
    return this.consecutivosService.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'ADMINISTRACION')
  async update(@Param('id') id: number, @Body() dto: UpdateConsecutivoDto) {
    return this.consecutivosService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(@Param('id') id: number) {
    return this.consecutivosService.delete(id);
  }
}
