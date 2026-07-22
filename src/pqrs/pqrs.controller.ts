import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PQRSService } from './pqrs.service';
import { CreatePQRSDto, UpdatePQRSDto, CreateComentarioDto } from './dto';

@Controller('pqrs')
export class PQRSController {
  private readonly logger = new Logger('PQRSController');

  constructor(private readonly pqrsService: PQRSService) {}

  @Get('tipos')
  async getTipos() {
    return this.pqrsService.getTipos();
  }

  @Get('estados')
  async getEstados() {
    this.logger.log(`📥 GET /pqrs/estados solicitado`);
    const estados = await this.pqrsService.getEstados();
    this.logger.log(
      `📤 Retornando ${estados.length} estados:`,
      JSON.stringify(estados, null, 2),
    );
    return estados;
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() createPqrsDto: CreatePQRSDto, @Request() req) {
    return this.pqrsService.create(createPqrsDto, req.user.usr_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getListado(@Request() req) {
    this.logger.log(
      `📥 GET /pqrs solicitado por usuario: ${req.user.id} (rol: ${req.user.rol})`,
    );
    const resultado = await this.pqrsService.getListado({
      usuario_id: req.user.id,
      rol: req.user.rol,
    });
    this.logger.log(`📤 Retornando ${resultado.length} PQRS`);
    return resultado;
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getById(@Param('id') id: number) {
    return this.pqrsService.getById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(@Param('id') id: number, @Body() updatePqrsDto: UpdatePQRSDto) {
    return this.pqrsService.update(id, updatePqrsDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/comentarios')
  async addComentario(
    @Param('id') id: number,
    @Body() createComentarioDto: CreateComentarioDto,
    @Request() req,
  ) {
    return this.pqrsService.addComentario(id, createComentarioDto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/comentarios')
  async getComentarios(@Param('id') id: number) {
    return this.pqrsService.getComentarios(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/historial')
  async getHistorial(@Param('id') id: number) {
    return this.pqrsService.getHistorial(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/adjuntos')
  @UseInterceptors(FileInterceptor('archivo'))
  async subirAdjunto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    return this.pqrsService.subirAdjunto(id, file, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/asignar')
  async asignar(
    @Param('id') id: number,
    @Body() body: { pqrs_usr_asignado_id: number },
    @Request() req,
  ) {
    return this.pqrsService.asignar(
      id,
      body.pqrs_usr_asignado_id,
      req.user.usr_id,
    );
  }
}
