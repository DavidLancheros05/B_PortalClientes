import { Controller, Get, Post, Body, Param, Put, Patch } from '@nestjs/common';
import { CartaPdfVinculacionService } from './carta-pdf-vinculacion.service';
import { CreateCartaPdfVinculacionDto } from './dto/create-carta-pdf-vinculacion.dto';
import { RequierePermiso } from '../../permissions/requiere-permiso.decorator';

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
  @RequierePermiso('/parametrizacion/carta-pdf-vinculacion', 'crear')
  create(@Body() dto: CreateCartaPdfVinculacionDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequierePermiso('/parametrizacion/carta-pdf-vinculacion', 'editar')
  update(@Param('id') id: number, @Body() body: any) {
    const data = {
      cpv_nombre: body.nombre,
      cpv_contenido: body.contenido,
    };
    return this.service.update(+id, data);
  }

  @Patch(':id/estado')
  @RequierePermiso('/parametrizacion/carta-pdf-vinculacion', 'eliminar')
  cambiarEstado(@Param('id') id: number, @Body('activo') activo: boolean) {
    return this.service.cambiarEstado(+id, activo);
  }
}
