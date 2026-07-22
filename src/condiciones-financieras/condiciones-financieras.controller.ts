import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { CondicionesFinancierasService } from './condiciones-financieras.service';
import { CondicionFinanciera } from './condicion-financiera.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('condiciones-financieras')
export class CondicionesFinancierasController {
  constructor(private readonly service: CondicionesFinancierasService) {}

  @Get()
  findAll(): Promise<CondicionFinanciera[]> {
    return this.service.findAll();
  }

  // Debe declararse antes de @Get(':id') para que "formas-pago" no
  // caiga en el ParseIntPipe de esa ruta
  @Get('formas-pago')
  getFormasPago() {
    return this.service.getFormasPago();
  }

  @Get('solicitud/:solicitudId')
  findBySolicitud(@Param('solicitudId', ParseIntPipe) solicitudId: number) {
    return this.service.findBySolicitud(solicitudId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: Partial<CondicionFinanciera>) {
    return this.service.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CondicionFinanciera>,
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
