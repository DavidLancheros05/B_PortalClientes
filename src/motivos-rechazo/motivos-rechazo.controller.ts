import { Controller, Get, Post, Body, Patch, Put, Param } from '@nestjs/common';
import { MotivosRechazoService } from './motivos-rechazo.service';
import { CreateMotivoRechazoDto } from './dto/create-motivo-rechazo.dto';

@Controller('motivos-rechazo')
export class MotivosRechazoController {
  constructor(private readonly service: MotivosRechazoService) {}

  // ✅ GET /motivos-rechazo - Retorna todos (para administración)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  // ✅ GET /motivos-rechazo/activos - Retorna solo activos
  @Get('activos')
  findAllActivos() {
    return this.service.findActivos();
  }

  // ✅ POST /motivos-rechazo
  @Post()
  create(@Body() dto: CreateMotivoRechazoDto) {
    return this.service.create(dto);
  }

  // ✅ PUT /motivos-rechazo/:id
  @Put(':id')
  update(@Param('id') id: number, @Body() dto: CreateMotivoRechazoDto) {
    return this.service.update(+id, dto);
  }

  // ✅ PATCH /motivos-rechazo/:id/estado
  @Patch(':id/estado')
  toggleActivo(@Param('id') id: number, @Body() body: { activo: boolean }) {
    return this.service.toggleActivo(+id, body.activo);
  }

  // ✅ PATCH /motivos-rechazo/:id/desactivar
  @Patch(':id/desactivar')
  desactivar(@Param('id') id: number) {
    return this.service.desactivar(+id);
  }
}
