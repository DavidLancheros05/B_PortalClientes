import { Controller, Get } from '@nestjs/common';
import { CentrosOperacionService } from './centros-operacion.service';

@Controller('centros-operacion')
export class CentrosOperacionController {
  constructor(
    private readonly centrosOperacionService: CentrosOperacionService,
  ) {}

  @Get()
  async getAll() {
    return this.centrosOperacionService.findAll();
  }
}
