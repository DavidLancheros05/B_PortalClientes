import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ModulosService } from './modulos.service';
import { CreateModuloDto } from './dto/create-modulo.dto';
import { UpdateModuloDto } from './dto/update-modulo.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('seguridad/modulos')
@UseGuards(JwtAuthGuard)
export class ModulosController {
  constructor(private readonly modulosService: ModulosService) {}

  @Get()
  async findAll() {
    return this.modulosService.findAll();
  }

  @Get('por-rol')
  async findByRol(@Query('rol_id') rolId: string) {
    if (!rolId) {
      return { error: 'rol_id es requerido' };
    }
    return this.modulosService.findByRol(Number(rolId));
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.modulosService.findById(id);
  }

  @Post()
  async create(@Body() createModuloDto: CreateModuloDto) {
    return this.modulosService.create(createModuloDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateModuloDto: UpdateModuloDto,
  ) {
    return this.modulosService.update(id, updateModuloDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.modulosService.remove(id);
  }

  @Put(':id/activar')
  async activate(@Param('id', ParseIntPipe) id: number) {
    return this.modulosService.activate(id);
  }
}
