import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FormularioTiposPreguntaService } from './formulario-tipos-pregunta.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('parametrizacion/formulario-tipos-pregunta')
export class FormularioTiposPreguntaController {
  constructor(
    private readonly formularioTiposPreguntaService: FormularioTiposPreguntaService,
  ) {}

  @Get()
  async listar(@Query('includeInactivos') includeInactivos?: string) {
    const includeInactivosBoolean = includeInactivos === 'true';
    return await this.formularioTiposPreguntaService.listar(
      includeInactivosBoolean,
    );
  }
}
