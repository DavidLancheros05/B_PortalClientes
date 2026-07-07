import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormularioPreguntaOpcion } from './entities/formulario-pregunta-opcion.entity';
import { CreateFormularioPreguntaOpcionDto } from './dto/create-formulario-pregunta-opcion.dto';
import { UpdateFormularioPreguntaOpcionDto } from './dto/update-formulario-pregunta-opcion.dto';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';

@Injectable()
export class OpcionesService {
  constructor(
    @InjectRepository(FormularioPreguntaOpcion)
    private readonly repo: Repository<FormularioPreguntaOpcion>,
  ) {}

  create(dto: CreateFormularioPreguntaOpcionDto) {
    const normalizedDto = {
      ...dto,
      fpo_valor: normalizeMojibake(dto.fpo_valor),
      fpo_estado: dto.fpo_estado ?? true,
    };

    return this.repo.save(normalizedDto);
  }

  async findByPregunta(fp_id: number) {
    const rows = await this.repo.find({
      where: { fpo_fp_id: fp_id, fpo_estado: true },
    });

    return rows.map((row) => ({
      ...row,
      fpo_valor: normalizeMojibake(row.fpo_valor),
    }));
  }

  update(fpo_id: number, dto: UpdateFormularioPreguntaOpcionDto) {
    const normalizedDto = {
      ...dto,
      fpo_valor: dto.fpo_valor
        ? normalizeMojibake(dto.fpo_valor)
        : dto.fpo_valor,
    };

    return this.repo.update(fpo_id, normalizedDto);
  }

  remove(fpo_id: number) {
    return this.repo.update(fpo_id, { fpo_estado: false });
  }
}
