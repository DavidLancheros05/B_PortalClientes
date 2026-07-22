import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FacturasService } from './facturas.service';
import { FacturaClienteResponseDto } from './dto/factura-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('facturas')
export class FacturasController {
  constructor(private readonly facturasService: FacturasService) {}

  @Get('cliente/:cliId')
  async getFacturasPorCliente(
    @Param('cliId') cliId: string,
  ): Promise<FacturaClienteResponseDto[]> {
    return this.facturasService.getFacturasPorCliente(+cliId);
  }
}
