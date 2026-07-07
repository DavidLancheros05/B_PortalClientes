// src/documentos/documentos.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Documento } from './tipos-documetos/entities/documento.entity';
import { CreateDocumentoDto } from './dto/create-documento.dto';
import { UpdateDocumentoDto } from './dto/update-documento.dto';
import { TipoDocumento } from '../parametrizacion/tipos-documentos/entities/tipo-documento.entity';
import { SolicitudEntity } from '../solicitudes/entities/solicitud.entity';

@Injectable()
export class DocumentosService {
  constructor(
    @InjectRepository(Documento)
    private documentosRepository: Repository<Documento>,
    @InjectRepository(TipoDocumento)
    private tiposDocumentoRepository: Repository<TipoDocumento>,
    @InjectRepository(SolicitudEntity)
    private solicitudesRepository: Repository<SolicitudEntity>,
  ) {}

  async findAll(): Promise<Documento[]> {
    return this.documentosRepository.find({
      order: { documentoId: 'DESC' },
      relations: ['solicitud', 'tipoDocumento'],
    });
  }

  async findOne(id: number): Promise<Documento> {
    const doc = await this.documentosRepository.findOne({
      where: { documentoId: id },
      relations: ['solicitud', 'tipoDocumento'],
    });
    if (!doc) throw new Error('Documento no encontrado');
    return doc;
  }

  async create(createDto: CreateDocumentoDto): Promise<Documento> {
    await this.validateDocumentoRules(
      createDto.tipoDocumentoId,
      createDto.solicitudId,
      createDto.fechaEmision,
    );

    const fechaVencimientoCalculada = await this.calculateFechaVencimiento(
      createDto.tipoDocumentoId,
      createDto.fechaEmision,
    );

    const doc = this.documentosRepository.create({
      ...createDto,
      fechaEmision: createDto.fechaEmision
        ? new Date(createDto.fechaEmision)
        : undefined,
      fechaVencimiento: createDto.fechaVencimiento
        ? new Date(createDto.fechaVencimiento)
        : fechaVencimientoCalculada,
    });
    return this.documentosRepository.save(doc);
  }

  async update(id: number, updateDto: UpdateDocumentoDto): Promise<Documento> {
    const doc = await this.documentosRepository.findOneBy({ documentoId: id });
    if (!doc) throw new Error('Documento no encontrado');

    const tipoDocumentoId = updateDto.tipoDocumentoId ?? doc.tipoDocumentoId;
    const solicitudId = updateDto.solicitudId ?? doc.solicitudId;
    const fechaEmision =
      updateDto.fechaEmision ?? doc.fechaEmision?.toISOString();

    await this.validateDocumentoRules(
      tipoDocumentoId,
      solicitudId,
      fechaEmision,
    );

    const fechaVencimientoCalculada = await this.calculateFechaVencimiento(
      tipoDocumentoId,
      typeof fechaEmision === 'string' ? fechaEmision : undefined,
    );

    if (updateDto.fechaEmision)
      doc.fechaEmision = new Date(updateDto.fechaEmision);
    if (updateDto.fechaVencimiento)
      doc.fechaVencimiento = new Date(updateDto.fechaVencimiento);

    Object.assign(doc, updateDto);

    if (!updateDto.fechaVencimiento && fechaVencimientoCalculada) {
      doc.fechaVencimiento = fechaVencimientoCalculada;
    }

    return this.documentosRepository.save(doc);
  }

  async remove(id: number): Promise<void> {
    await this.documentosRepository.delete({ documentoId: id });
  }

  private async validateDocumentoRules(
    tipoDocumentoId: number,
    solicitudId: number,
    fechaEmision?: string,
  ) {
    const tipo = await this.tiposDocumentoRepository.findOne({
      where: { tipoDocumentoId },
    });

    if (!tipo) {
      throw new BadRequestException('Tipo de documento no existe');
    }

    if (!tipo.estado) {
      throw new BadRequestException('El tipo de documento está inactivo');
    }

    if (tipo.aplicaFechaEmision && !fechaEmision) {
      throw new BadRequestException(
        'La fecha de emisión es obligatoria para este tipo de documento',
      );
    }

    const solicitud = await this.solicitudesRepository.findOne({
      where: { sol_id: solicitudId },
      select: { sol_id: true, sol_es_zona_franca: true },
    });

    if (!solicitud) {
      throw new BadRequestException('Solicitud no encontrada');
    }

    if (tipo.aplicaZonaFranca && !solicitud.sol_es_zona_franca) {
      throw new BadRequestException(
        'Este tipo de documento aplica solo para usuario zona franca',
      );
    }
  }

  private async calculateFechaVencimiento(
    tipoDocumentoId: number,
    fechaEmision?: string,
  ): Promise<Date | undefined> {
    if (!fechaEmision) {
      return undefined;
    }

    const tipo = await this.tiposDocumentoRepository.findOne({
      where: { tipoDocumentoId },
      select: {
        tipoDocumentoId: true,
        aplicaFechaEmision: true,
        vigenciaDias: true,
      },
    });

    if (!tipo?.aplicaFechaEmision || !tipo.vigenciaDias) {
      return undefined;
    }

    const baseDate = new Date(fechaEmision);
    if (Number.isNaN(baseDate.getTime())) {
      throw new BadRequestException('La fecha de emisión no es válida');
    }

    const vencimiento = new Date(baseDate);
    vencimiento.setDate(vencimiento.getDate() + tipo.vigenciaDias);
    return vencimiento;
  }
}
