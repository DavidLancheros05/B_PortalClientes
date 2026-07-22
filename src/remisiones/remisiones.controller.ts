import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RemisionesService } from './remisiones.service';
import { RemisionClienteResponseDto } from './dto/remision-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('remisiones')
export class RemisionesController {
  constructor(private readonly remisionesService: RemisionesService) {}

  @Get('cliente/:cliId')
  async getRemisionesPorCliente(
    @Param('cliId') cliId: string,
  ): Promise<RemisionClienteResponseDto[]> {
    return this.remisionesService.getRemisionesPorCliente(+cliId);
  }
}
