import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { TiposVigenciaService } from './tipos-vigencia.service';
import { UpdateTipoVigenciaDto } from './dto/update-tipo-vigencia.dto';

@Controller('parametrizacion/tipos-vigencia')
export class TiposVigenciaController {
  constructor(private readonly tiposVigenciaService: TiposVigenciaService) {}

  @Get()
  findAll(@Query('activo') activo?: string) {
    const onlyActive = activo === '1' || activo === 'true';
    return this.tiposVigenciaService.findAll(onlyActive);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTipoVigenciaDto,
  ) {
    return this.tiposVigenciaService.update(id, updateDto);
  }
}
