import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PedidosService } from './pedidos.service';
import { PedidoClienteResponseDto } from './dto/pedido-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  @Get('cliente/:cliId')
  async getPedidosPorCliente(
    @Param('cliId') cliId: string,
  ): Promise<PedidoClienteResponseDto[]> {
    return this.pedidosService.getPedidosPorCliente(+cliId);
  }
}
