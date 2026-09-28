import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CondicionFinanciera } from './condicion-financiera.entity';

@Injectable()
export class CondicionesFinancierasService {
  constructor(
    @InjectRepository(CondicionFinanciera)
    private readonly repo: Repository<CondicionFinanciera>,
    private readonly dataSource: DataSource,
  ) {}

  findAll(): Promise<CondicionFinanciera[]> {
    return this.repo.find();
  }

  getCondicionesPago(): Promise<{ cp_id: number; cp_descripcion: string }[]> {
    return this.dataSource.query(
      'SELECT cp_id, cp_descripcion FROM Condicion_pago WHERE cp_estado = 1 ORDER BY cp_descripcion',
    );
  }

  findBySolicitud(solicitudId: number): Promise<CondicionFinanciera[]> {
    return this.repo.find({ where: { sa_sol_id: solicitudId } });
  }

  async findOne(id: number): Promise<CondicionFinanciera> {
    const entity = await this.repo.findOne({ where: { condicion_id: id } });
    if (!entity)
      throw new NotFoundException(`CondicionFinanciera ${id} no encontrada`);
    return entity;
  }

  create(data: Partial<CondicionFinanciera>): Promise<CondicionFinanciera> {
    return this.repo.save(this.repo.create(data));
  }

  async update(
    id: number,
    data: Partial<CondicionFinanciera>,
  ): Promise<CondicionFinanciera> {
    await this.findOne(id);
    await this.repo.update(id, data);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.repo.delete(id);
  }
}
