import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExistenciasService } from './existencias.service';
import { ExistenciaClienteResponseDto } from './dto/existencia-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('existencias')
export class ExistenciasController {
  constructor(private readonly existenciasService: ExistenciasService) {}

  @Get('cliente/:cliId')
  async getExistenciasPorCliente(
    @Param('cliId') cliId: string,
  ): Promise<ExistenciaClienteResponseDto[]> {
    return this.existenciasService.getExistenciasPorCliente(+cliId);
  }
}
