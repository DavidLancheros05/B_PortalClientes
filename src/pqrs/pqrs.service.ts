import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PQRSEntity,
  PQRSTipoEntity,
  PQRSEstadoEntity,
  PQRSHistorialEntity,
  PQRSComentarioEntity,
  PQRSAdjuntoEntity,
  PQRSAsignacionEntity,
} from './entities';
import { CreatePQRSDto, UpdatePQRSDto, CreateComentarioDto } from './dto';

@Injectable()
export class PQRSService {
  private readonly logger = new Logger('PQRSService');

  constructor(
    @InjectRepository(PQRSEntity)
    private readonly pqrsRepository: Repository<PQRSEntity>,
    @InjectRepository(PQRSTipoEntity)
    private readonly tipoRepository: Repository<PQRSTipoEntity>,
    @InjectRepository(PQRSEstadoEntity)
    private readonly estadoRepository: Repository<PQRSEstadoEntity>,
    @InjectRepository(PQRSHistorialEntity)
    private readonly historialRepository: Repository<PQRSHistorialEntity>,
    @InjectRepository(PQRSComentarioEntity)
    private readonly comentarioRepository: Repository<PQRSComentarioEntity>,
    @InjectRepository(PQRSAdjuntoEntity)
    private readonly adjuntoRepository: Repository<PQRSAdjuntoEntity>,
    @InjectRepository(PQRSAsignacionEntity)
    private readonly asignacionRepository: Repository<PQRSAsignacionEntity>,
  ) {}

  async getTipos() {
    return this.tipoRepository.find({
      where: { pt_estado: true },
      order: { pt_nombre: 'ASC' },
    });
  }

  async getEstados() {
    return this.estadoRepository.find({
      where: { pe_estado: true },
      order: { pe_orden: 'ASC' },
    });
  }

  async create(createPqrsDto: CreatePQRSDto, usuarioId: number) {
    // Validar que el tipo existe
    const tipo = await this.tipoRepository.findOne({
      where: { pt_id: createPqrsDto.pqrs_pt_id, pt_estado: true },
    });

    if (!tipo) {
      throw new BadRequestException('Tipo de PQRS no válido');
    }

    // Obtener estado inicial (PENDIENTE)
    const estadoInicial = await this.estadoRepository.findOne({
      where: { pe_codigo: 'PENDIENTE' },
    });

    if (!estadoInicial) {
      throw new BadRequestException('Estado inicial no configurado');
    }

    // Generar número único de PQRS usando procedimiento almacenado
    const numero = await this.obtenerSiguienteNumeroPQRS();

    // Crear PQRS
    const pqrs = this.pqrsRepository.create({
      ...createPqrsDto,
      pqrs_numero: numero,
      pqrs_pe_id: estadoInicial.pe_id,
      pqrs_cliu_id: usuarioId,
    });

    const resultado = await this.pqrsRepository.save(pqrs);

    // Registrar en historial
    await this.historialRepository.save({
      ph_pqrs_id: resultado.pqrs_id,
      ph_pe_nuevo_id: estadoInicial.pe_id,
      ph_usr_id: usuarioId,
      ph_accion: 'CREAR',
      ph_comentario: 'PQRS creada',
    });

    return resultado;
  }

  async getListado(filtros?: any) {
    this.logger.log(
      `🔍 getListado() llamado con filtros:`,
      JSON.stringify(filtros),
    );

    let query = this.pqrsRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.tipo', 't')
      .leftJoinAndSelect('p.estado', 'e')
      .orderBy('p.pqrs_fecha_creacion', 'DESC');

    this.logger.log(`📋 SQL generado (inicial):`, query.getSql());

    if (filtros?.pt_id) {
      query = query.andWhere('p.pqrs_pt_id = :tipoId', {
        tipoId: filtros.pt_id,
      });
    }

    if (filtros?.pe_id) {
      query = query.andWhere('p.pqrs_pe_id = :estadoId', {
        estadoId: filtros.pe_id,
      });
    }

    if (filtros?.usuario_id) {
      const esStaff = ['ADMIN', 'ADMINISTRACION', 'EJECUTIVO'].includes(
        filtros.rol,
      );

      if (esStaff) {
        query = query.andWhere(
          '(p.pqrs_usr_asignado_id = :usuarioId OR p.pqrs_usr_asignado_id IS NULL)',
          { usuarioId: filtros.usuario_id },
        );
      } else {
        query = query.andWhere('p.pqrs_cliu_id = :usuarioId', {
          usuarioId: filtros.usuario_id,
        });
      }
    }

    if (filtros?.numero) {
      query = query.andWhere('p.pqrs_numero LIKE :numero', {
        numero: `%${filtros.numero}%`,
      });
    }

    this.logger.log(`📋 SQL final:`, query.getSql());

    const resultados = await query.getMany();

    this.logger.log(`✅ Resultados obtenidos: ${resultados.length} registros`);
    if (resultados.length > 0) {
      this.logger.log(
        `🔍 Primer resultado:`,
        JSON.stringify(resultados[0], null, 2),
      );
    }

    return resultados;
  }

  async getById(id: number) {
    this.logger.log(`🔍 getById(${id}) llamado`);
    const pqrs = await this.pqrsRepository.findOne({
      where: { pqrs_id: id },
      relations: [
        'tipo',
        'estado',
        'historial',
        'comentarios',
        'adjuntos',
        'asignaciones',
      ],
    });

    if (!pqrs) {
      this.logger.warn(`⚠️ PQRS ${id} no encontrada`);
      throw new NotFoundException('PQRS no encontrada');
    }

    this.logger.log(`✅ PQRS encontrada:`, JSON.stringify(pqrs, null, 2));
    return pqrs;
  }

  async update(id: number, updatePqrsDto: UpdatePQRSDto) {
    const pqrs = await this.getById(id);

    // Si cambia el estado, registrar en historial
    if (
      updatePqrsDto.pqrs_pe_id &&
      updatePqrsDto.pqrs_pe_id !== pqrs.pqrs_pe_id
    ) {
      await this.historialRepository.save({
        ph_pqrs_id: id,
        ph_pe_anterior_id: pqrs.pqrs_pe_id,
        ph_pe_nuevo_id: updatePqrsDto.pqrs_pe_id,
        ph_accion: 'CAMBIO_ESTADO',
      });
    }

    await this.pqrsRepository.update(id, updatePqrsDto);
    return this.getById(id);
  }

  async addComentario(
    pqrsId: number,
    dto: CreateComentarioDto,
    usuario: { usr_id?: number; rol?: string; cliente_id?: number },
  ) {
    this.logger.log(`📝 addComentario() - pqrsId: ${pqrsId}`);
    this.logger.log(`👤 Usuario recibido:`, JSON.stringify(usuario, null, 2));

    const pqrs = await this.getById(pqrsId);
    this.logger.log(`🔍 PQRS cargada - Estado actual:`, {
      pe_id: pqrs.pqrs_pe_id,
      pe_codigo: pqrs.estado?.pe_codigo,
      pe_nombre: pqrs.estado?.pe_nombre,
    });

    // Validar que CERRADA no puede recibir comentarios
    if (pqrs.estado?.pe_codigo === 'CERRADA') {
      throw new BadRequestException(
        'Esta PQRS está cerrada y no acepta más comentarios',
      );
    }

    const isCliente = usuario.rol === 'CLIENTE';
    this.logger.log(
      `🔐 isCliente = usuario.rol ('${usuario.rol}') === 'CLIENTE'? ${isCliente}`,
    );

    const comentario = this.comentarioRepository.create({
      pc_pqrs_id: pqrsId,
      ...(isCliente
        ? { pc_cliu_id: usuario.cliente_id }
        : { pc_usr_id: usuario.usr_id }),
      ...dto,
    });

    const resultado = await this.comentarioRepository.save(comentario);
    this.logger.log(`✅ Comentario guardado con id: ${resultado.pc_id}`);

    // Si es cliente y el estado permite cambio automático, cambiar estado
    this.logger.log(`🚦 Evaluando cambio de estado:`);
    this.logger.log(`   - isCliente: ${isCliente}`);
    this.logger.log(`   - Estado actual: ${pqrs.estado?.pe_codigo}`);
    this.logger.log(
      `   - Estados que permiten cambio: ['PENDIENTE_CLIENTE', 'RESUELTA']`,
    );
    this.logger.log(
      `   - ¿Incluye el estado? ${['PENDIENTE_CLIENTE', 'RESUELTA'].includes(pqrs.estado?.pe_codigo || '')}`,
    );

    if (
      isCliente &&
      ['PENDIENTE_CLIENTE', 'RESUELTA'].includes(pqrs.estado?.pe_codigo)
    ) {
      this.logger.log(`✅ Condición cumplida - Buscando estado EN_REVISION...`);

      const estadoEnRevision = await this.estadoRepository.findOne({
        where: { pe_codigo: 'EN_REVISION' },
      });

      this.logger.log(
        `🔍 Estado EN_REVISION encontrado:`,
        estadoEnRevision
          ? {
              pe_id: estadoEnRevision.pe_id,
              pe_codigo: estadoEnRevision.pe_codigo,
            }
          : 'NO ENCONTRADO',
      );

      if (estadoEnRevision) {
        this.logger.log(
          `🔄 Actualizando PQRS ${pqrsId} a estado EN_REVISION (pe_id: ${estadoEnRevision.pe_id})...`,
        );

        const updateResult = await this.pqrsRepository.update(pqrsId, {
          pqrs_pe_id: estadoEnRevision.pe_id,
        });

        this.logger.log(`📊 Resultado de update:`, updateResult);

        this.logger.log(`📋 Registrando en historial...`);
        await this.historialRepository.save({
          ph_pqrs_id: pqrsId,
          ph_pe_anterior_id: pqrs.pqrs_pe_id,
          ph_pe_nuevo_id: estadoEnRevision.pe_id,
          ph_cliu_id: usuario.cliente_id,
          ph_accion: 'RESPUESTA_CLIENTE',
          ph_comentario: 'Cliente respondió, PQRS en revisión',
        });

        this.logger.log(
          `✅ Estado cambiado exitosamente de ${pqrs.estado?.pe_codigo} a EN_REVISION`,
        );
      } else {
        this.logger.warn(`⚠️ No se encontró estado EN_REVISION en la BD`);
      }
    } else {
      this.logger.log(`❌ Condición no cumplida - No se cambia estado`);
      if (!isCliente)
        this.logger.log(`   - Usuario no es cliente (rol: ${usuario.rol})`);
      if (
        !['PENDIENTE_CLIENTE', 'RESUELTA'].includes(
          pqrs.estado?.pe_codigo || '',
        )
      ) {
        this.logger.log(
          `   - Estado no está en lista permitida (estado: ${pqrs.estado?.pe_codigo})`,
        );
      }
    }

    return resultado;
  }

  async getComentarios(pqrsId: number) {
    await this.getById(pqrsId);

    return this.comentarioRepository.find({
      where: { pc_pqrs_id: pqrsId },
      relations: ['usuario', 'cliente'],
      order: { pc_fecha: 'DESC' },
    });
  }

  async getHistorial(pqrsId: number) {
    await this.getById(pqrsId);

    const eventos = await this.historialRepository.find({
      where: { ph_pqrs_id: pqrsId },
      relations: ['estadoAnterior', 'estadoNuevo'],
      order: { ph_fecha: 'DESC' },
    });

    return eventos.map((evento) => ({
      id: evento.ph_id,
      tipo_evento: evento.ph_accion,
      fecha_evento: evento.ph_fecha,
      mensaje: evento.ph_comentario,
      estado_anterior: evento.estadoAnterior?.pe_nombre,
      estado_nuevo: evento.estadoNuevo?.pe_nombre,
    }));
  }

  async asignar(id: number, usuarioAsignado: number, usuarioActual: number) {
    const pqrs = await this.getById(id);

    await this.pqrsRepository.update(id, {
      pqrs_usr_asignado_id: usuarioAsignado,
    });

    await this.historialRepository.save({
      ph_pqrs_id: id,
      ph_usr_id: usuarioActual,
      ph_accion: 'ASIGNACION',
      ph_comentario: `Solicitud asignada a usuario ${usuarioAsignado}`,
    });

    return this.getById(id);
  }

  private async obtenerSiguienteNumeroPQRS(): Promise<string> {
    const queryRunner =
      this.pqrsRepository.manager.connection.createQueryRunner();

    try {
      const result = await queryRunner.query(
        `DECLARE @numero_pqrs NVARCHAR(50);
         EXEC sp_ObtenerSiguienteNumeroPQRS @numero_pqrs OUTPUT;
         SELECT @numero_pqrs as numero_pqrs;`,
      );

      if (result && result.length > 0) {
        return result[0].numero_pqrs;
      }

      throw new Error('No se pudo generar el número de PQRS');
    } finally {
      await queryRunner.release();
    }
  }
}
