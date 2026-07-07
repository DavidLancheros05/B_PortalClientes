import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsecutivoEntity, TipoConsecutivoEntity } from './entities';
import {
  CreateConsecutivoDto,
  UpdateConsecutivoDto,
  CreateTipoConsecutivoDto,
  UpdateTipoConsecutivoDto,
} from './dto';

@Injectable()
export class ConsecutivosService {
  constructor(
    @InjectRepository(ConsecutivoEntity)
    private readonly consecutivoRepository: Repository<ConsecutivoEntity>,
    @InjectRepository(TipoConsecutivoEntity)
    private readonly tipoRepository: Repository<TipoConsecutivoEntity>,
  ) {}

  async findAll() {
    return this.consecutivoRepository.find({
      order: { cons_ptc_id: 'ASC', cons_cop_id: 'ASC' },
    });
  }

  async findById(id: number) {
    return this.consecutivoRepository.findOne({
      where: { cons_id: id },
    });
  }

  async create(dto: CreateConsecutivoDto) {
    const consecutivo = this.consecutivoRepository.create({
      ...dto,
      cons_fecha_usr: new Date(),
    });
    return this.consecutivoRepository.save(consecutivo);
  }

  async update(id: number, dto: UpdateConsecutivoDto) {
    await this.consecutivoRepository.update(id, {
      ...dto,
      cons_fecha_usr: new Date(),
    });
    return this.findById(id);
  }

  async delete(id: number) {
    await this.consecutivoRepository.delete(id);
    return { message: 'Consecutivo eliminado' };
  }

  // Tipo Consecutivo CRUD
  async findAllTipos() {
    return this.tipoRepository.find({
      order: { ptc_id: 'ASC' },
    });
  }

  async findTipoById(id: number) {
    return this.tipoRepository.findOne({
      where: { ptc_id: id },
    });
  }

  async createTipo(dto: CreateTipoConsecutivoDto) {
    const tipo = this.tipoRepository.create({
      ...dto,
      ptc_fecha_usr: new Date(),
    });
    return this.tipoRepository.save(tipo);
  }

  async updateTipo(id: number, dto: UpdateTipoConsecutivoDto) {
    await this.tipoRepository.update(id, {
      ...dto,
      ptc_fecha_usr: new Date(),
    });
    return this.findTipoById(id);
  }

  async deleteTipo(id: number) {
    await this.tipoRepository.delete(id);
    return { message: 'Tipo de consecutivo eliminado' };
  }
}
