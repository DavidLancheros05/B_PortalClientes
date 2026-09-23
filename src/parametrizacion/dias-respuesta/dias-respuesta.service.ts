import { BadRequestException, Injectable } from '@nestjs/common';
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

  // pdr_area llega como el nombre de una etapa (ver obtenerAreas); el
  // wet_id es lo que se usa para buscar los días, así que tiene que existir.
  private async resolverEtapa(area: string): Promise<number> {
    const [etapa] = await this.dataSource.query(
      `SELECT wet_id FROM workflow_etapas WHERE UPPER(LTRIM(RTRIM(wet_nombre))) = UPPER(LTRIM(RTRIM(@0)))`,
      [area],
    );
    if (!etapa) {
      throw new BadRequestException(
        `El área "${area}" no corresponde a ninguna etapa del workflow.`,
      );
    }
    return etapa.wet_id;
  }

  async create(dto: CreateDiaRespuestaDto) {
    const nuevo = this.repo.create({
      ...dto,
      wet_id: await this.resolverEtapa(dto.pdr_area),
      pdr_estado: true,
    });

    return this.repo.save(nuevo);
  }

  async update(id: number, data: Partial<DiaRespuesta>) {
    const cambios = { ...data };
    delete cambios.wet_id;
    if (cambios.pdr_area !== undefined) {
      cambios.wet_id = await this.resolverEtapa(cambios.pdr_area);
    }
    return this.repo.update(id, cambios);
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
