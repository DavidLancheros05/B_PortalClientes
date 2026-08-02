import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoDocumento } from './entities/tipo-documento.entity';
import { CreateTipoDocumentoDto } from './dto/create-tipo-documento.dto';
import { UpdateTipoDocumentoDto } from './dto/update-tipo-documento.dto';
import { TiposVigenciaService } from '../tipos-vigencia/tipos-vigencia.service';
import {
  IStorageService,
  STORAGE_SERVICE,
} from '../../common/storage/storage.interface';

@Injectable()
export class TiposDocumentosService {
  constructor(
    @InjectRepository(TipoDocumento)
    private readonly tiposDocumentoRepository: Repository<TipoDocumento>,
    private readonly tiposVigenciaService: TiposVigenciaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
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
      tipoPlantilla: createDto.tipoPlantilla ?? 'TEXTO',
      plantillaContenido:
        createDto.tienePlantilla && createDto.tipoPlantilla !== 'PDF_SOLICITUD'
          ? (createDto.plantillaContenido ?? null)
          : null,
      formatoCodigo: createDto.formatoCodigo ?? null,
      formatoCodigoSecundario: createDto.formatoCodigoSecundario ?? null,
      revision: createDto.revision ?? null,
      paginasTotal: createDto.paginasTotal ?? null,
      origen: createDto.origen ?? 'CLIENTE',
      encabezadoTipo: createDto.encabezadoTipo ?? 'NINGUNO',
      piePaginaTipo: createDto.piePaginaTipo ?? 'NINGUNO',
      piePaginaTexto: createDto.piePaginaTexto ?? null,
      createdBy: null,
      updatedBy: null,
    });

    const guardado = await this.tiposDocumentoRepository.save(entity);

    if (guardado.origen === 'CARTA_APROBACION' && guardado.estado) {
      await this.desactivarOtrasCartasAprobacion(guardado.tipoDocumentoId);
    }

    return guardado;
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
      ...(updateDto.tipoPlantilla !== undefined
        ? { tipoPlantilla: updateDto.tipoPlantilla }
        : {}),
      ...(updateDto.plantillaContenido !== undefined
        ? { plantillaContenido: updateDto.plantillaContenido }
        : {}),
      ...(updateDto.formatoCodigo !== undefined
        ? { formatoCodigo: updateDto.formatoCodigo }
        : {}),
      ...(updateDto.formatoCodigoSecundario !== undefined
        ? { formatoCodigoSecundario: updateDto.formatoCodigoSecundario }
        : {}),
      ...(updateDto.revision !== undefined
        ? { revision: updateDto.revision }
        : {}),
      ...(updateDto.paginasTotal !== undefined
        ? { paginasTotal: updateDto.paginasTotal }
        : {}),
      ...(updateDto.origen !== undefined ? { origen: updateDto.origen } : {}),
      ...(updateDto.encabezadoTipo !== undefined
        ? { encabezadoTipo: updateDto.encabezadoTipo }
        : {}),
      ...(updateDto.piePaginaTipo !== undefined
        ? { piePaginaTipo: updateDto.piePaginaTipo }
        : {}),
      ...(updateDto.piePaginaTexto !== undefined
        ? { piePaginaTexto: updateDto.piePaginaTexto }
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
      tipoPlantilla: merged.tipoPlantilla ?? tipo.tipoPlantilla,
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

    if (!merged.tienePlantilla || merged.tipoPlantilla === 'PDF_SOLICITUD') {
      merged.plantillaContenido = null;
    }

    merged.updatedAt = new Date();

    Object.assign(tipo, merged);
    const guardado = await this.tiposDocumentoRepository.save(tipo);

    if (guardado.origen === 'CARTA_APROBACION' && guardado.estado) {
      await this.desactivarOtrasCartasAprobacion(guardado.tipoDocumentoId);
    }

    return guardado;
  }

  async remove(id: number): Promise<void> {
    const tipo = await this.findOne(id);
    await this.tiposDocumentoRepository.remove(tipo);
  }

  // La Carta de Vinculación (origen CARTA_APROBACION) se elige en
  // enviarCartaVinculacionPorCorreo con "la única activa" — sin esta regla,
  // dos filas activas a la vez vuelven no determinista cuál se envía de
  // verdad por correo (bug real que tenía param_carta_pdf_vinculacion antes
  // de esta migración, con SELECT TOP 1 sin ORDER BY). Activar una desactiva
  // cualquier otra automáticamente, como un radio button.
  private async desactivarOtrasCartasAprobacion(
    idActivo: number,
  ): Promise<void> {
    await this.tiposDocumentoRepository
      .createQueryBuilder()
      .update(TipoDocumento)
      .set({ estado: false })
      .where('tdo_origen = :origen', { origen: 'CARTA_APROBACION' })
      .andWhere('tdo_id <> :idActivo', { idActivo })
      .execute();
  }

  async subirEncabezadoImagen(
    id: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<TipoDocumento> {
    const tipo = await this.findOne(id);

    const subida = await this.storageService.upload(file.buffer, {
      folder: 'parametrizacion/tipos-documentos/encabezados',
      filename: `${Date.now()}_${file.originalname}`,
      mimetype: file.mimetype,
    });

    tipo.encabezadoTipo = 'IMAGEN';
    tipo.encabezadoImagenUrl = subida.url;
    tipo.updatedAt = new Date();
    return this.tiposDocumentoRepository.save(tipo);
  }

  async subirPiePaginaImagen(
    id: number,
    file: { buffer: Buffer; originalname: string; mimetype: string },
  ): Promise<TipoDocumento> {
    const tipo = await this.findOne(id);

    const subida = await this.storageService.upload(file.buffer, {
      folder: 'parametrizacion/tipos-documentos/pie-pagina',
      filename: `${Date.now()}_${file.originalname}`,
      mimetype: file.mimetype,
    });

    tipo.piePaginaTipo = 'IMAGEN';
    tipo.piePaginaImagenUrl = subida.url;
    tipo.updatedAt = new Date();
    return this.tiposDocumentoRepository.save(tipo);
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
    tipoPlantilla?: string | null;
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

    if (
      input.tienePlantilla &&
      input.tipoPlantilla !== 'PDF_SOLICITUD' &&
      !input.plantillaContenido?.trim()
    ) {
      throw new BadRequestException(
        'El contenido de la plantilla es obligatorio cuando el documento tiene plantilla descargable de tipo texto',
      );
    }
  }
}
