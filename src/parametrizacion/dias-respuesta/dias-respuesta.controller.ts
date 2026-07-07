import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Patch,
  Query,
} from '@nestjs/common';
import { DiasRespuestaService } from './dias-respuesta.service';
import { CreateDiaRespuestaDto } from './dto/create-dia-respuesta.dto';

@Controller('parametrizacion/dias-respuesta')
export class DiasRespuestaController {
  constructor(private readonly service: DiasRespuestaService) {}

  @Get('areas')
  obtenerAreas() {
    return this.service.obtenerAreas();
  }

  @Get('search')
  search(
    @Query('area') area?: string,
    @Query('estado') estado?: string,
    @Query('dias') dias?: string,
  ) {
    return this.service.search({
      area: area || undefined,
      estado: estado === 'true' ? true : estado === 'false' ? false : undefined,
      dias: dias ? Number(dias) : undefined,
    });
  }

  @Get()
  findAll() {
    console.log('📊 BACKEND CONTROLLER DIAS RESPUESTA findAll');
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateDiaRespuestaDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() body: any) {
    return this.service.update(+id, body);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id') id: number,
    @Body() body: { pdr_estado: boolean },
  ) {
    return this.service.cambiarEstado(+id, body.pdr_estado);
  }
}
