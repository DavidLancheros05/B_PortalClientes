import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PedidosService } from './pedidos.service';
import { PedidoClienteResponseDto } from './dto/pedido-cliente.response.dto';

type ReqUsuario = Request & {
  user: {
    rol?: string;
    cliente_id?: number;
    cli_id?: number;
    ejng_id?: number | null;
  };
};

// Quién ve qué: documentacion/Portal Clientes/CONSULTAS/
// listado-pedidos-por-tipo-de-usuario.md.
@UseGuards(JwtAuthGuard)
@Controller('pedidos')
export class PedidosController {
  constructor(private readonly pedidosService: PedidosService) {}

  private esCliente(req: ReqUsuario) {
    return !req.user?.rol || req.user.rol === 'CLIENTE';
  }

  // Autorización por objeto (IDOR): un CLIENTE solo su propio cli_id; un
  // ejecutivo solo clientes de su cartera; el resto del personal interno,
  // cualquier cliente.
  private async verificarAccesoCliente(clienteId: number, req: ReqUsuario) {
    if (this.esCliente(req)) {
      const propio = req.user?.cliente_id ?? req.user?.cli_id;
      if (Number(propio) !== Number(clienteId)) {
        throw new ForbiddenException('No tienes acceso a este cliente');
      }
      return;
    }
    const ejngId = req.user.ejng_id;
    if (
      ejngId &&
      !(await this.pedidosService.clientePerteneceAEjecutivo(clienteId, ejngId))
    ) {
      throw new ForbiddenException('Este cliente no pertenece a tu cartera');
    }
  }

  // Cartera de un ejecutivo: nunca un CLIENTE, y un usuario con ejng_id
  // asignado solo la suya (un ejecutivo no ve la cartera de otro).
  private verificarAccesoEjecutivo(ejngId: number, req: ReqUsuario) {
    if (this.esCliente(req)) {
      throw new ForbiddenException(
        'Solo el personal interno puede acceder a esta información',
      );
    }
    const propio = req.user.ejng_id;
    if (propio && Number(propio) !== Number(ejngId)) {
      throw new ForbiddenException('No tienes acceso a este ejecutivo');
    }
  }

  @Get('cliente/:cliId')
  async getPedidosPorCliente(
    @Param('cliId') cliId: string,
    @Req() req: ReqUsuario,
  ): Promise<PedidoClienteResponseDto[]> {
    await this.verificarAccesoCliente(+cliId, req);
    const pedidos = await this.pedidosService.getPedidosPorCliente(+cliId);
    // Las columnas internas se quitan acá, no solo en pantalla.
    return this.esCliente(req)
      ? this.pedidosService.soloCamposCliente(pedidos)
      : pedidos;
  }

  @Get('ejecutivo/:ejngId')
  async getPedidosPorEjecutivo(
    @Param('ejngId') ejngId: string,
    @Req() req: ReqUsuario,
  ): Promise<PedidoClienteResponseDto[]> {
    this.verificarAccesoEjecutivo(+ejngId, req);
    return this.pedidosService.getPedidosPorEjecutivo(+ejngId);
  }
}
