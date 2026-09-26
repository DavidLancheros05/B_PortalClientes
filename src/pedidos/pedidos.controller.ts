import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AccesoClienteService,
  UsuarioSesion,
} from '../common/acceso/acceso-cliente.service';
import { PedidosService } from './pedidos.service';
import { PedidoClienteResponseDto } from './dto/pedido-cliente.response.dto';

type ReqUsuario = Request & { user: UsuarioSesion };

// Quién ve qué: documentacion/Portal Clientes/CONSULTAS/
// listado-pedidos-por-tipo-de-usuario.md.
@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(
    private readonly pedidosService: PedidosService,
    private readonly accesoCliente: AccesoClienteService,
  ) {}

  @Get('cliente/:cliId')
  async getPedidosPorCliente(
    @Param('cliId') cliId: string,
    @Req() req: ReqUsuario,
  ): Promise<PedidoClienteResponseDto[]> {
    await this.accesoCliente.verificarAccesoCliente(+cliId, req.user);
    const pedidos = await this.pedidosService.getPedidosPorCliente(+cliId);
    // Las columnas internas se quitan acá, no solo en pantalla.
    return this.accesoCliente.esCliente(req.user)
      ? this.pedidosService.soloCamposCliente(pedidos)
      : pedidos;
  }

  @Get('ejecutivo/:ejngId')
  async getPedidosPorEjecutivo(
    @Param('ejngId') ejngId: string,
    @Req() req: ReqUsuario,
  ): Promise<PedidoClienteResponseDto[]> {
    this.accesoCliente.verificarAccesoEjecutivo(+ejngId, req.user);
    return this.pedidosService.getPedidosPorEjecutivo(+ejngId);
  }
}
