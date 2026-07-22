import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { UnoService } from './uno.service';
import { DatosIdentificacionClienteResponseDto } from './dto/datos-identificacion-cliente.response.dto';

@UseGuards(JwtAuthGuard)
@Controller('integraciones/uno')
export class UnoController {
  constructor(private readonly unoService: UnoService) {}

  @Get('clientes/:nit')
  async getDatosIdentificacion(
    @Param('nit') nit: string,
  ): Promise<DatosIdentificacionClienteResponseDto> {
    return this.unoService.obtenerDatosIdentificacionPorNit(nit);
  }
}
