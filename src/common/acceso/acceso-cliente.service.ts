import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteEntity } from '../../clientes/entities/clientes.entity';

export type UsuarioSesion = {
  rol?: string;
  cliente_id?: number | null;
  cli_id?: number | null;
  ejng_id?: number | null;
};

// Autorización por objeto (IDOR) para las consultas por cliente
// (`GET /<modulo>/cliente/:cliId`: pedidos, remisiones, facturas,
// existencias, cartera). Quién ve qué: documentacion/Portal Clientes/
// CONSULTAS/listado-pedidos-por-tipo-de-usuario.md.
//
// El módulo que lo use debe tener TypeOrmModule.forFeature([ClienteEntity])
// y declararlo en `providers`.
@Injectable()
export class AccesoClienteService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  esCliente(user: UsuarioSesion | undefined): boolean {
    return !user?.rol || user.rol === 'CLIENTE';
  }

  // Un CLIENTE solo su propio cli_id; un usuario con ejng_id (ejecutivo)
  // solo clientes de su cartera; el resto del personal interno, cualquiera.
  async verificarAccesoCliente(
    clienteId: number,
    user: UsuarioSesion | undefined,
  ): Promise<void> {
    if (this.esCliente(user)) {
      const propio = user?.cliente_id ?? user?.cli_id;
      if (Number(propio) !== Number(clienteId)) {
        throw new ForbiddenException('No tienes acceso a este cliente');
      }
      return;
    }
    const ejngId = user?.ejng_id;
    if (ejngId && !(await this.clientePerteneceAEjecutivo(clienteId, ejngId))) {
      throw new ForbiddenException('Este cliente no pertenece a tu cartera');
    }
  }

  // Cartera de un ejecutivo: nunca un CLIENTE, y un usuario con ejng_id
  // asignado solo la suya (un ejecutivo no ve la cartera de otro).
  verificarAccesoEjecutivo(
    ejngId: number,
    user: UsuarioSesion | undefined,
  ): void {
    if (this.esCliente(user)) {
      throw new ForbiddenException(
        'Solo el personal interno puede acceder a esta información',
      );
    }
    const propio = user?.ejng_id;
    if (propio && Number(propio) !== Number(ejngId)) {
      throw new ForbiddenException('No tienes acceso a este ejecutivo');
    }
  }

  private clientePerteneceAEjecutivo(
    cliId: number,
    ejngId: number,
  ): Promise<boolean> {
    return this.clienteRepo.exists({
      where: { cli_id: cliId, ejng_id: ejngId },
    });
  }
}
