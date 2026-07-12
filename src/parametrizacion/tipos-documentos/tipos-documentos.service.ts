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
import { TiposVigenciaService } from '../tipos-vigencia/tipos-vigencia.service';

@Injectable()
export class TiposDocumentosService {
  constructor(
    @InjectRepository(TipoDocumento)
    private readonly tiposDocumentoRepository: Repository<TipoDocumento>,
    private readonly tiposVigenciaService: TiposVigenciaService,
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
    await this.validateBusinessRules(createDto);

    const reglaVigencia = createDto.aplicaFechaEmision
      ? (createDto.reglaVigencia ?? null)
      : null;

    const entity = this.tiposDocumentoRepository.create({
      nombre: createDto.nombre.trim(),
      descripcion: createDto.descripcion.trim(),
      obligatorio: createDto.obligatorio,
      aplicaFechaEmision: createDto.aplicaFechaEmision,
      reglaVigencia,
      vigenciaDias:
        reglaVigencia === 'DIAS' ? (createDto.vigenciaDias ?? null) : null,
      aniosAtrasPermitidos:
        reglaVigencia === 'ANIO'
          ? (createDto.aniosAtrasPermitidos ?? null)
          : null,
      aplicaZonaFranca: createDto.aplicaZonaFranca,
      estado: createDto.estado ?? true,
      aplicaCliente: true,
      tienePlantilla: createDto.tienePlantilla ?? false,
      plantillaContenido: createDto.tienePlantilla
        ? (createDto.plantillaContenido ?? null)
        : null,
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
      ...(updateDto.reglaVigencia !== undefined
        ? { reglaVigencia: updateDto.reglaVigencia }
        : {}),
      ...(updateDto.aniosAtrasPermitidos !== undefined
        ? { aniosAtrasPermitidos: updateDto.aniosAtrasPermitidos }
        : {}),
      ...(updateDto.aplicaZonaFranca !== undefined
        ? { aplicaZonaFranca: updateDto.aplicaZonaFranca }
        : {}),
      ...(updateDto.estado !== undefined ? { estado: updateDto.estado } : {}),
      ...(updateDto.tienePlantilla !== undefined
        ? { tienePlantilla: updateDto.tienePlantilla }
        : {}),
      ...(updateDto.plantillaContenido !== undefined
        ? { plantillaContenido: updateDto.plantillaContenido }
        : {}),
    };

    await this.validateBusinessRules({
      nombre: merged.nombre ?? tipo.nombre,
      descripcion: merged.descripcion ?? tipo.descripcion,
      obligatorio: merged.obligatorio ?? tipo.obligatorio,
      aplicaFechaEmision: merged.aplicaFechaEmision ?? tipo.aplicaFechaEmision,
      vigenciaDias: merged.vigenciaDias ?? undefined,
      reglaVigencia: merged.reglaVigencia ?? tipo.reglaVigencia ?? undefined,
      aniosAtrasPermitidos: merged.aniosAtrasPermitidos ?? undefined,
      aplicaZonaFranca: merged.aplicaZonaFranca ?? tipo.aplicaZonaFranca,
      estado: merged.estado,
      tienePlantilla: merged.tienePlantilla ?? tipo.tienePlantilla,
      plantillaContenido:
        merged.plantillaContenido ?? tipo.plantillaContenido ?? undefined,
    });

    if (!merged.aplicaFechaEmision) {
      merged.reglaVigencia = null;
      merged.vigenciaDias = null;
      merged.aniosAtrasPermitidos = null;
    } else if (merged.reglaVigencia === 'DIAS') {
      merged.aniosAtrasPermitidos = null;
    } else if (merged.reglaVigencia === 'ANIO') {
      merged.vigenciaDias = null;
    } else {
      merged.vigenciaDias = null;
      merged.aniosAtrasPermitidos = null;
    }

    if (!merged.tienePlantilla) {
      merged.plantillaContenido = null;
    }

    merged.updatedAt = new Date();

    Object.assign(tipo, merged);
    return this.tiposDocumentoRepository.save(tipo);
  }

  async remove(id: number): Promise<void> {
    const tipo = await this.findOne(id);
    await this.tiposDocumentoRepository.remove(tipo);
  }

  private async validateBusinessRules(input: {
    nombre: string;
    descripcion?: string | null;
    obligatorio: boolean;
    aplicaFechaEmision: boolean;
    vigenciaDias?: number | null;
    reglaVigencia?: string | null;
    aniosAtrasPermitidos?: number | null;
    aplicaZonaFranca: boolean;
    estado?: boolean;
    tienePlantilla?: boolean;
    plantillaContenido?: string | null;
  }) {
    if (!input.nombre || !input.nombre.trim()) {
      throw new BadRequestException('El nombre del documento es obligatorio');
    }

    if (!input.descripcion || !input.descripcion.trim()) {
      throw new BadRequestException(
        'La descripcion del documento es obligatoria',
      );
    }

    if (input.aplicaFechaEmision && input.reglaVigencia) {
      const tipoVigencia = await this.tiposVigenciaService.findByCodigo(
        input.reglaVigencia,
      );
      if (!tipoVigencia || !tipoVigencia.estado) {
        throw new BadRequestException(
          `El tipo de vigencia "${input.reglaVigencia}" no existe o está inactivo`,
        );
      }
    }

    if (input.aplicaFechaEmision && input.reglaVigencia === 'DIAS') {
      if (!input.vigenciaDias || input.vigenciaDias <= 0) {
        throw new BadRequestException(
          'El tiempo de validez (días) es obligatorio para la regla "Vencimiento por días"',
        );
      }
    }

    if (input.aplicaFechaEmision && input.reglaVigencia === 'ANIO') {
      if (
        input.aniosAtrasPermitidos === null ||
        input.aniosAtrasPermitidos === undefined ||
        input.aniosAtrasPermitidos < 0
      ) {
        throw new BadRequestException(
          'Los "años hacia atrás permitidos" son obligatorios para la regla "Debe ser de un año específico"',
        );
      }
    }

    if (input.tienePlantilla && !input.plantillaContenido?.trim()) {
      throw new BadRequestException(
        'El contenido de la plantilla es obligatorio cuando el documento tiene plantilla descargable',
      );
    }
  }
}
