import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AccesoClienteService,
  UsuarioSesion,
} from '../common/acceso/acceso-cliente.service';
import { ExistenciasService } from './existencias.service';
import { ExistenciaClienteResponseDto } from './dto/existencia-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('existencias')
export class ExistenciasController {
  constructor(
    private readonly existenciasService: ExistenciasService,
    private readonly accesoCliente: AccesoClienteService,
  ) {}

  // Mismo control que pedidos: cliente solo lo suyo, ejecutivo solo su
  // cartera (ver AccesoClienteService).
  @Get('cliente/:cliId')
  async getExistenciasPorCliente(
    @Param('cliId') cliId: string,
    @Req() req: Request & { user: UsuarioSesion },
  ): Promise<ExistenciaClienteResponseDto[]> {
    await this.accesoCliente.verificarAccesoCliente(+cliId, req.user);
    return this.existenciasService.getExistenciasPorCliente(+cliId);
  }
}
