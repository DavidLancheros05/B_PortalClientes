import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AccesoClienteService,
  UsuarioSesion,
} from '../common/acceso/acceso-cliente.service';
import { RemisionesService } from './remisiones.service';
import { RemisionClienteResponseDto } from './dto/remision-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('remisiones')
export class RemisionesController {
  constructor(
    private readonly remisionesService: RemisionesService,
    private readonly accesoCliente: AccesoClienteService,
  ) {}

  // Mismo control que pedidos: cliente solo lo suyo, ejecutivo solo su
  // cartera (ver AccesoClienteService).
  @Get('cliente/:cliId')
  async getRemisionesPorCliente(
    @Param('cliId') cliId: string,
    @Req() req: Request & { user: UsuarioSesion },
  ): Promise<RemisionClienteResponseDto[]> {
    await this.accesoCliente.verificarAccesoCliente(+cliId, req.user);
    return this.remisionesService.getRemisionesPorCliente(+cliId);
  }
}
