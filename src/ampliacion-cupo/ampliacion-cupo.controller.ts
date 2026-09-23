import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Put,
  Delete,
  Logger,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';
import { AmpliacionCupoService } from './ampliacion-cupo.service';
import { CreateAmpliacionCupoDto, UpdateAmpliacionCupoDto } from './dto';

type UsuarioToken = {
  usr_id: number;
  rol?: string;
  cliente_id?: number;
  cli_id?: number;
};

@Controller('ampliacion-cupo')
@UseGuards(JwtAuthGuard)
export class AmpliacionCupoController {
  private readonly logger = new Logger('AmpliacionCupoController');

  constructor(private readonly service: AmpliacionCupoService) {}

  // Un CLIENTE solo puede ver ampliaciones de su propio cli_id (mismo patrón
  // que PQRS: antes cualquier usuario autenticado podía listar las de todos
  // o cambiar el :clienteId / :id de la URL).
  private verificarPropiedadCliente(user: UsuarioToken, clienteId: number) {
    if (
      user?.rol === 'CLIENTE' &&
      Number(user.cliente_id ?? user.cli_id) !== Number(clienteId)
    ) {
      throw new ForbiddenException('No tienes acceso a esta ampliación de cupo');
    }
  }

  @Post()
  @RequierePermiso('/solicitudes/solicitud-ampliacion-cupo', 'crear')
  async create(
    @Body() dto: CreateAmpliacionCupoDto,
    @Req() req: Request & { user: UsuarioToken },
  ) {
    this.logger.log('Creating ampliacion-cupo');
    return await this.service.create(dto, req.user.usr_id);
  }

  @Get()
  async findAll(@Req() req: Request & { user: UsuarioToken }) {
    if (req.user?.rol === 'CLIENTE') {
      throw new ForbiddenException(
        'No tienes acceso al listado de ampliaciones de cupo',
      );
    }
    this.logger.log('Finding all ampliaciones-cupo');
    return await this.service.findAll();
  }

  @Get('cliente/:clienteId')
  async findByCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Req() req: Request & { user: UsuarioToken },
  ) {
    this.verificarPropiedadCliente(req.user, clienteId);
    this.logger.log(`Finding ampliaciones-cupo for cliente ${clienteId}`);
    return await this.service.findByCliente(clienteId);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: UsuarioToken },
  ) {
    this.logger.log(`Finding ampliacion-cupo ${id}`);
    const ampliacion = await this.service.findOne(id);
    this.verificarPropiedadCliente(req.user, ampliacion.sol_cli_id);
    return ampliacion;
  }

  @Put(':id')
  @RequierePermiso('/solicitudes/solicitud-ampliacion-cupo', 'editar')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAmpliacionCupoDto,
  ) {
    this.logger.log(`Updating ampliacion-cupo ${id}`);
    return await this.service.update(id, dto);
  }

  @Delete(':id')
  @RequierePermiso('/solicitudes/solicitud-ampliacion-cupo', 'eliminar')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    this.logger.log(`Deleting ampliacion-cupo ${id}`);
    await this.service.remove(id);
  }
}
