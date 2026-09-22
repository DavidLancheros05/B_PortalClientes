import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClientesService } from './clientes.service';
import { ClientesSiesaService } from './clientes-siesa.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { CambiarPasswordClienteDto } from './dto/cambiar-password-cliente.dto';
import { ClienteListResponseDto } from './dto/cliente-list.response.dto';
import { ClienteDetailResponseDto } from './dto/cliente-detail.response.dto';
import { CentroOperacionResponseDto } from './dto/centro-operacion.response.dto';

type AuthRequest = Request & {
  user: { id: number; cliente_id: number | null; rol: string };
};

@UseGuards(JwtAuthGuard)
@Controller('clientes')
export class ClientesController {
  constructor(
    private readonly clientesService: ClientesService,
    private readonly clientesSiesaService: ClientesSiesaService,
  ) {}

  @Get()
  async getAll(): Promise<ClienteListResponseDto[]> {
    return this.clientesService.findAll();
  }

  // Debe ir antes de @Get(':id') para no ser interpretada como un id.
  // Autoservicio: el cliente ve su propio perfil, nunca el de otro (usa el
  // cliente_id del JWT, no un id recibido por parametro).
  @UseGuards(RolesGuard)
  @Roles('CLIENTE')
  @Get('perfil')
  async getPerfil(@Req() req: AuthRequest): Promise<ClienteDetailResponseDto> {
    return this.clientesService.findOne(req.user.cliente_id!);
  }

  // Debe ir antes de @Get(':id') para no ser interpretada como un id.
  @UseGuards(RolesGuard)
  @Roles('CLIENTE')
  @Patch('perfil/cambiar-contrasena')
  async cambiarPasswordPerfil(
    @Req() req: AuthRequest,
    @Body() dto: CambiarPasswordClienteDto,
  ): Promise<{ message: string }> {
    return this.clientesService.changePasswordCliente(
      req.user.cliente_id!,
      dto.currentPassword,
      dto.newPassword,
    );
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
  @RequierePermiso('/parametrizacion/clientes/listado', 'crear')
  async create(
    @Body() dto: CreateClienteDto,
  ): Promise<ClienteDetailResponseDto> {
    try {
      const result = await this.clientesService.create(dto);

      return result;
    } catch (error) {
      console.error('[CONTROLLER] POST /clientes - Error:', error);
      throw error;
    }
  }

  @Get('centro/:copId')
  async getByCentro(
    @Param('copId') copId: string,
  ): Promise<ClienteListResponseDto[]> {
    return this.clientesService.findByCentro(+copId);
  }

  // Debe ir antes de @Get(':id') para no ser interpretada como un id.
  // Solo vista previa — no envía nada a SIESA (todavía no hay conexión
  // real, ver Portal Clientes/SIESA/plan-envio-solicitud-aprobada-a-siesa.md).
  @Get(':id/siesa-preview')
  async getSiesaPreview(@Param('id') id: string) {
    return this.clientesSiesaService.generarPreviewSiesa(+id);
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
  @RequierePermiso('/parametrizacion/clientes/listado', 'editar')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClienteDto,
  ): Promise<ClienteDetailResponseDto> {
    return this.clientesService.update(+id, dto);
  }

  @Post(':id/desbloquear')
  @RequierePermiso('/parametrizacion/clientes/listado', 'editar')
  async desbloquear(@Param('id') id: string): Promise<{ message: string }> {
    await this.clientesService.desbloquear(+id);
    return { message: 'Cliente desbloqueado correctamente' };
  }

  @Delete(':id')
  @RequierePermiso('/parametrizacion/clientes/listado', 'eliminar')
  async delete(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.clientesService.delete(+id);
    return { success: true };
  }

  @Post(':id/reset-password')
  @RequierePermiso('/parametrizacion/clientes/listado', 'editar')
  async resetPassword(@Param('id') id: string): Promise<{ message: string }> {
    return this.clientesService.resetPasswordCliente(+id);
  }
}
