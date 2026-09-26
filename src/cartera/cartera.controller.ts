import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AccesoClienteService,
  UsuarioSesion,
} from '../common/acceso/acceso-cliente.service';
import { CarteraService } from './cartera.service';
import { SaldoClienteResponseDto } from './dto/saldo-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('cartera')
export class CarteraController {
  constructor(
    private readonly carteraService: CarteraService,
    private readonly accesoCliente: AccesoClienteService,
  ) {}

  // Mismo control que pedidos: cliente solo lo suyo, ejecutivo solo su
  // cartera (ver AccesoClienteService).
  @Get('cliente/:cliId')
  async getSaldosPorCliente(
    @Param('cliId') cliId: string,
    @Req() req: Request & { user: UsuarioSesion },
  ): Promise<SaldoClienteResponseDto[]> {
    await this.accesoCliente.verificarAccesoCliente(+cliId, req.user);
    return this.carteraService.getSaldosPorCliente(+cliId);
  }
}
