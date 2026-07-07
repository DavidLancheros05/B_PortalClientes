import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { FormularioService } from './formulario.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('formulario')
export class FormularioController {
  constructor(private readonly formularioService: FormularioService) {}

  @Get(':id/secciones')
  getSecciones(@Param('id', ParseIntPipe) id: number) {
    return this.formularioService.getSeccionesConPreguntas(id);
  }
}
