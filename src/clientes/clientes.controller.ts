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
import { ClientesService } from './clientes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClienteListResponseDto } from './dto/cliente-list.response.dto';
import { ClienteDetailResponseDto } from './dto/cliente-detail.response.dto';
import { CentroOperacionResponseDto } from './dto/centro-operacion.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  async getAll(): Promise<ClienteListResponseDto[]> {
    return this.clientesService.findAll();
  }

  // Debe ir antes de @Get(':id') para no ser interpretada como un id.
  @Get('ejecutivos-negocio')
  async getEjecutivosNegocio() {
    return this.clientesService.getEjecutivosNegocio();
  }

  // Debe ir antes de @Get(':id') para no ser interpretada como un id.
  @Get('aprobados')
  async getAllAprobados(): Promise<ClienteListResponseDto[]> {
    return this.clientesService.findAllAprobados();
  }

  @Post()
  async create(
    @Body() dto: CreateClienteDto,
  ): Promise<ClienteDetailResponseDto> {
    console.log('🟢 [CONTROLLER] POST /clientes - Body recibido:', dto);
    try {
      const result = await this.clientesService.create(dto);
      console.log('🟢 [CONTROLLER] POST /clientes - Resultado:', result);
      return result;
    } catch (error) {
      console.error('🔴 [CONTROLLER] POST /clientes - Error:', error);
      throw error;
    }
  }

  @Get('centro/:copId')
  async getByCentro(
    @Param('copId') copId: string,
  ): Promise<ClienteListResponseDto[]> {
    return this.clientesService.findByCentro(+copId);
  }

  @Get(':id/centros-operacion')
  async getClienteCentros(
    @Param('id') id: string,
  ): Promise<CentroOperacionResponseDto[]> {
    return this.clientesService.getClienteCentros(+id);
  }

  @Get(':id')
  async getOne(@Param('id') id: string): Promise<ClienteDetailResponseDto> {
    return this.clientesService.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
  ): Promise<ClienteDetailResponseDto> {
    return this.clientesService.update(+id, dto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.clientesService.delete(+id);
    return { success: true };
  }
}
