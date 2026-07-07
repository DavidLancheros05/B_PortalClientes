import { Controller, Get, Post, Body, Param, Put, Patch } from '@nestjs/common';
import { CartaPdfVinculacionService } from './carta-pdf-vinculacion.service';
import { CreateCartaPdfVinculacionDto } from './dto/create-carta-pdf-vinculacion.dto';

@Controller('parametrizacion/carta-pdf-vinculacion')
export class CartaPdfVinculacionController {
  constructor(private readonly service: CartaPdfVinculacionService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: number) {
    return this.service.findById(+id);
  }

  @Post()
  create(@Body() dto: CreateCartaPdfVinculacionDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() body: any) {
    const data = {
      cpv_nombre: body.nombre,
      cpv_contenido: body.contenido,
    };
    return this.service.update(+id, data);
  }

  @Patch(':id/estado')
  cambiarEstado(@Param('id') id: number, @Body('activo') activo: boolean) {
    return this.service.cambiarEstado(+id, activo);
  }
}
