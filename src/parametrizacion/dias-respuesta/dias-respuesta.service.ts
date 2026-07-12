import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DiaRespuesta } from './dias-respuesta.entity';
import { CreateDiaRespuestaDto } from './dto/create-dia-respuesta.dto';

@Injectable()
export class DiasRespuestaService {
  constructor(
    @InjectRepository(DiaRespuesta)
    private repo: Repository<DiaRespuesta>,
    private dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({ order: { pdr_id: 'ASC' } });
  }

  create(dto: CreateDiaRespuestaDto) {
    const nuevo = this.repo.create({
      ...dto,
      pdr_estado: true,
    });

    return this.repo.save(nuevo);
  }

  update(id: number, data: Partial<DiaRespuesta>) {
    return this.repo.update(id, data);
  }

  async cambiarEstado(id: number, estado: boolean) {
    return this.repo.update({ pdr_id: id }, { pdr_estado: estado });
  }

  async search(filters: { area?: string; estado?: boolean; dias?: number }) {
    const query = this.repo.createQueryBuilder('pdr');

    if (filters.area) {
      query.andWhere('UPPER(TRIM(pdr.pdr_area)) = UPPER(TRIM(:area))', {
        area: filters.area,
      });
    }

    if (filters.estado !== undefined) {
      query.andWhere('pdr.pdr_estado = :estado', {
        estado: filters.estado,
      });
    }

    if (filters.dias !== undefined) {
      query.andWhere('pdr.pdr_dias = :dias', { dias: filters.dias });
    }

    return query.orderBy('pdr.pdr_id', 'ASC').getMany();
  }

  async obtenerAreas(): Promise<string[]> {
    const result = await this.dataSource.query(
      `SELECT DISTINCT wet_nombre FROM workflow_etapas ORDER BY wet_nombre`,
    );
    return result.map((row: any) => row.wet_nombre);
  }
}
