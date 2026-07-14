import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Logger,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AmpliacionCupoService } from './ampliacion-cupo.service';
import { CreateAmpliacionCupoDto, UpdateAmpliacionCupoDto } from './dto';

@Controller('ampliacion-cupo')
@UseGuards(JwtAuthGuard)
export class AmpliacionCupoController {
  private readonly logger = new Logger('AmpliacionCupoController');

  constructor(private readonly service: AmpliacionCupoService) {}

  @Post()
  async create(
    @Body() dto: CreateAmpliacionCupoDto,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    this.logger.log('Creating ampliacion-cupo');
    return await this.service.create(dto, req.user.usr_id);
  }

  @Get()
  async findAll() {
    this.logger.log('Finding all ampliaciones-cupo');
    return await this.service.findAll();
  }

  @Get('cliente/:clienteId')
  async findByCliente(@Param('clienteId') clienteId: number) {
    this.logger.log(`Finding ampliaciones-cupo for cliente ${clienteId}`);
    return await this.service.findByCliente(+clienteId);
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    this.logger.log(`Finding ampliacion-cupo ${id}`);
    return await this.service.findOne(+id);
  }

  @Put(':id')
  async update(@Param('id') id: number, @Body() dto: UpdateAmpliacionCupoDto) {
    this.logger.log(`Updating ampliacion-cupo ${id}`);
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    this.logger.log(`Deleting ampliacion-cupo ${id}`);
    await this.service.remove(+id);
  }
}
