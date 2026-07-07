import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Logger,
} from '@nestjs/common';
import { AmpliacionCupoService } from './ampliacion-cupo.service';
import { CreateAmpliacionCupoDto, UpdateAmpliacionCupoDto } from './dto';
import { AmpliacionCupoEntity } from './entities';

@Controller('ampliacion-cupo')
export class AmpliacionCupoController {
  private readonly logger = new Logger('AmpliacionCupoController');

  constructor(private readonly service: AmpliacionCupoService) {}

  @Post()
  async create(
    @Body() dto: CreateAmpliacionCupoDto,
  ): Promise<AmpliacionCupoEntity> {
    this.logger.log('Creating ampliacion-cupo');
    return await this.service.create(dto);
  }

  @Get()
  async findAll(): Promise<AmpliacionCupoEntity[]> {
    this.logger.log('Finding all ampliaciones-cupo');
    return await this.service.findAll();
  }

  @Get('cliente/:clienteId')
  async findByCliente(
    @Param('clienteId') clienteId: number,
  ): Promise<AmpliacionCupoEntity[]> {
    this.logger.log(`Finding ampliaciones-cupo for cliente ${clienteId}`);
    return await this.service.findByCliente(+clienteId);
  }

  @Get(':id')
  async findOne(@Param('id') id: number): Promise<AmpliacionCupoEntity> {
    this.logger.log(`Finding ampliacion-cupo ${id}`);
    return await this.service.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateAmpliacionCupoDto,
  ): Promise<AmpliacionCupoEntity> {
    this.logger.log(`Updating ampliacion-cupo ${id}`);
    return await this.service.update(+id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: number): Promise<void> {
    this.logger.log(`Deleting ampliacion-cupo ${id}`);
    await this.service.remove(+id);
  }
}
