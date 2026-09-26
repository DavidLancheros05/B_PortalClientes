import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AccesoClienteService,
  UsuarioSesion,
} from '../common/acceso/acceso-cliente.service';
import { FacturasService } from './facturas.service';
import { FacturaClienteResponseDto } from './dto/factura-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('facturas')
export class FacturasController {
  constructor(
    private readonly facturasService: FacturasService,
    private readonly accesoCliente: AccesoClienteService,
  ) {}

  // Mismo control que pedidos: cliente solo lo suyo, ejecutivo solo su
  // cartera (ver AccesoClienteService).
  @Get('cliente/:cliId')
  async getFacturasPorCliente(
    @Param('cliId') cliId: string,
    @Req() req: Request & { user: UsuarioSesion },
  ): Promise<FacturaClienteResponseDto[]> {
    await this.accesoCliente.verificarAccesoCliente(+cliId, req.user);
    return this.facturasService.getFacturasPorCliente(+cliId);
  }
}
