// src/cliente-archivo/cliente-archivo.controller.ts
import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClienteArchivoService } from './cliente-archivo.service';

type AuthRequest = Request & {
  user: { rol?: string; cliente_id?: number; cli_id?: number };
};

@UseGuards(JwtAuthGuard)
@Controller('cliente-archivo')
export class ClienteArchivoController {
  constructor(private readonly clienteArchivoService: ClienteArchivoService) {}

  // Mismo criterio que verificarAccesoSolicitud (solicitudes-documentos.service.ts):
  // el personal interno puede consultar el archivo de cualquier cliente; un
  // CLIENTE solo el propio.
  @Get('cliente/:clienteId')
  async obtenerArchivoCliente(
    @Param('clienteId') clienteId: number,
    @Req() req: AuthRequest,
  ) {
    if (req.user?.rol === 'CLIENTE') {
      const propioId = req.user.cliente_id ?? req.user.cli_id;
      if (Number(propioId) !== Number(clienteId)) {
        throw new ForbiddenException('No tienes acceso al archivo de otro cliente');
      }
    }

    return this.clienteArchivoService.obtenerArchivoCliente(Number(clienteId));
  }
}
