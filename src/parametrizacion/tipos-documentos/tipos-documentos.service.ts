import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoDocumento } from './entities/tipo-documento.entity';
import { CreateTipoDocumentoDto } from './dto/create-tipo-documento.dto';
import { UpdateTipoDocumentoDto } from './dto/update-tipo-documento.dto';

@Injectable()
export class TiposDocumentosService {
  constructor(
    @InjectRepository(TipoDocumento)
    private readonly tiposDocumentoRepository: Repository<TipoDocumento>,
  ) {}

  async findAll(onlyActive?: boolean): Promise<TipoDocumento[]> {
    const whereClause = onlyActive === true ? { estado: true } : undefined;

    return this.tiposDocumentoRepository.find({
      where: whereClause,
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number): Promise<TipoDocumento> {
    const tipo = await this.tiposDocumentoRepository.findOne({
      where: { tipoDocumentoId: id },
    });

    if (!tipo) {
      throw new NotFoundException('Tipo de documento no encontrado');
    }

    return tipo;
  }

  async create(createDto: CreateTipoDocumentoDto): Promise<TipoDocumento> {
    this.validateBusinessRules(createDto);

    const entity = this.tiposDocumentoRepository.create({
      nombre: createDto.nombre.trim(),
      descripcion: createDto.descripcion.trim(),
      obligatorio: createDto.obligatorio,
      aplicaFechaEmision: createDto.aplicaFechaEmision,
      vigenciaDias: createDto.aplicaFechaEmision
        ? (createDto.vigenciaDias ?? null)
        : null,
      aplicaZonaFranca: createDto.aplicaZonaFranca,
      estado: createDto.estado ?? true,
      aplicaCliente: true,
      createdBy: null,
      updatedBy: null,
    });

    return this.tiposDocumentoRepository.save(entity);
  }

  async update(
    id: number,
    updateDto: UpdateTipoDocumentoDto,
  ): Promise<TipoDocumento> {
    const tipo = await this.findOne(id);

    const merged: Partial<TipoDocumento> = {
      ...tipo,
      ...(updateDto.nombre !== undefined
        ? { nombre: updateDto.nombre.trim() }
        : {}),
      ...(updateDto.descripcion !== undefined
        ? { descripcion: updateDto.descripcion.trim() }
        : {}),
      ...(updateDto.obligatorio !== undefined
        ? { obligatorio: updateDto.obligatorio }
        : {}),
      ...(updateDto.aplicaFechaEmision !== undefined
        ? { aplicaFechaEmision: updateDto.aplicaFechaEmision }
        : {}),
      ...(updateDto.vigenciaDias !== undefined
        ? { vigenciaDias: updateDto.vigenciaDias }
        : {}),
      ...(updateDto.aplicaZonaFranca !== undefined
        ? { aplicaZonaFranca: updateDto.aplicaZonaFranca }
        : {}),
      ...(updateDto.estado !== undefined ? { estado: updateDto.estado } : {}),
    };

    this.validateBusinessRules({
      nombre: merged.nombre ?? tipo.nombre,
      descripcion: merged.descripcion ?? tipo.descripcion,
      obligatorio: merged.obligatorio ?? tipo.obligatorio,
      aplicaFechaEmision: merged.aplicaFechaEmision ?? tipo.aplicaFechaEmision,
      vigenciaDias: merged.vigenciaDias ?? undefined,
      aplicaZonaFranca: merged.aplicaZonaFranca ?? tipo.aplicaZonaFranca,
      estado: merged.estado,
    });

    if (!merged.aplicaFechaEmision) {
      merged.vigenciaDias = null;
    }

    merged.updatedAt = new Date();

    Object.assign(tipo, merged);
    return this.tiposDocumentoRepository.save(tipo);
  }

  async remove(id: number): Promise<void> {
    const tipo = await this.findOne(id);
    await this.tiposDocumentoRepository.remove(tipo);
  }

  private validateBusinessRules(input: {
    nombre: string;
    descripcion?: string | null;
    obligatorio: boolean;
    aplicaFechaEmision: boolean;
    vigenciaDias?: number | null;
    aplicaZonaFranca: boolean;
    estado?: boolean;
  }) {
    if (!input.nombre || !input.nombre.trim()) {
      throw new BadRequestException('El nombre del documento es obligatorio');
    }

    if (!input.descripcion || !input.descripcion.trim()) {
      throw new BadRequestException(
        'La descripcion del documento es obligatoria',
      );
    }

    if (input.aplicaFechaEmision) {
      if (!input.vigenciaDias || input.vigenciaDias <= 0) {
        throw new BadRequestException(
          'El tiempo de validez (días) es obligatorio cuando aplica fecha de emisión',
        );
      }
    }
  }
}
