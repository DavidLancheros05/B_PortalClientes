import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CarteraService } from './cartera.service';
import { SaldoClienteResponseDto } from './dto/saldo-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get('cliente/:cliId')
  async getSaldosPorCliente(
    @Param('cliId') cliId: string,
  ): Promise<SaldoClienteResponseDto[]> {
    return this.carteraService.getSaldosPorCliente(+cliId);
  }
}
