import { Controller, Get, UseGuards } from '@nestjs/common';
import { TiposIdentificacionService } from './tipos-identificacion.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tipos-identificacion')
export class TiposIdentificacionController {
  constructor(
    private readonly tiposIdentificacionService: TiposIdentificacionService,
  ) {}

  @Get()
  async getTiposIdentificacion() {
    return this.tiposIdentificacionService.getTiposIdentificacion();
  }
}
