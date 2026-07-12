import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoVigencia } from './entities/tipo-vigencia.entity';
import { UpdateTipoVigenciaDto } from './dto/update-tipo-vigencia.dto';

@Injectable()
export class TiposVigenciaService {
  constructor(
    @InjectRepository(TipoVigencia)
    private readonly tiposVigenciaRepository: Repository<TipoVigencia>,
  ) {}

  async findAll(onlyActive?: boolean): Promise<TipoVigencia[]> {
    const whereClause = onlyActive === true ? { estado: true } : undefined;

    return this.tiposVigenciaRepository.find({
      where: whereClause,
      order: { orden: 'ASC' },
    });
  }

  async findByCodigo(codigo: string): Promise<TipoVigencia | null> {
    return this.tiposVigenciaRepository.findOne({ where: { codigo } });
  }

  async update(
    id: number,
    updateDto: UpdateTipoVigenciaDto,
  ): Promise<TipoVigencia> {
    const tipo = await this.tiposVigenciaRepository.findOne({
      where: { tipoVigenciaId: id },
    });

    if (!tipo) {
      throw new NotFoundException('Tipo de vigencia no encontrado');
    }

    if (updateDto.nombre !== undefined) tipo.nombre = updateDto.nombre.trim();
    if (updateDto.descripcion !== undefined)
      tipo.descripcion = updateDto.descripcion.trim();
    if (updateDto.estado !== undefined) tipo.estado = updateDto.estado;

    return this.tiposVigenciaRepository.save(tipo);
  }
}
