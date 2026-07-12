import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormularioPregunta } from './entities/formulario-pregunta.entity';
import { CreateFormularioPreguntaDto } from './dto/create-formulario-pregunta.dto';
import { UpdateFormularioPreguntaDto } from './dto/update-formulario-pregunta.dto';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';

@Injectable()
export class FormularioPreguntasService {
  constructor(
    @InjectRepository(FormularioPregunta)
    private readonly formularioPreguntaRepository: Repository<FormularioPregunta>,
  ) {}

  create(dto: CreateFormularioPreguntaDto) {
    const normalizedDto = {
      ...dto,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
      fp_created_at: new Date(),
    };

    return this.formularioPreguntaRepository.save(normalizedDto);
  }

  async findAll(
    formularioId?: number,
    version?: number,
    soloActivas: boolean = true,
  ) {
    const query = this.formularioPreguntaRepository
      .createQueryBuilder('fp')
      .leftJoinAndSelect('fp.opciones', 'opciones')
      .leftJoinAndSelect('fp.seccion', 'seccion');

    if (formularioId) {
      query.andWhere('fp.formulario_id = :formularioId', { formularioId });
    }

    if (version) {
      query.andWhere('ISNULL(fp.fp_version, 1) = :version', { version });
    }

    if (soloActivas) {
      query.andWhere('fp.fp_estado = :fpEstado', { fpEstado: true });
    }

    query
      .orderBy('ISNULL(fp.seccion_id, 0)', 'ASC')
      .addOrderBy('fp.fp_orden', 'ASC');

    const preguntas = await query.getMany();

    return preguntas.map((p) => ({
      ...p,
      seccion_nombre: p.seccion?.fs_nombre ?? null,
      seccion_descripcion: p.seccion?.fs_descripcion ?? null,
      seccion_orden: p.seccion?.fs_orden ?? null,
      seccion_oculta_en_formulario: p.seccion?.fs_oculta_en_formulario ?? false,
      opciones: (p.opciones ?? [])
        .filter((o) => o.fpo_estado)
        .map((o) => ({
          op_id: o.fpo_id,
          op_descripcion: normalizeMojibake(o.fpo_valor),
        })),
    }));
  }

  async findOne(id: number) {
    const row = await this.formularioPreguntaRepository.findOne({
      where: { fp_id: id },
      relations: ['opciones'],
    });

    if (!row) return row;

    return {
      ...row,
      fp_descripcion: normalizeMojibake(row.fp_descripcion),
      opciones:
        row.opciones?.map((option) => ({
          op_id: option.fpo_id,
          op_descripcion: normalizeMojibake(option.fpo_valor),
        })) ?? [],
      seccion_nombre: row.seccion?.fs_nombre,
      seccion_descripcion: row.seccion?.fs_descripcion,
      seccion_orden: row.seccion?.fs_orden,
    };
  }

  update(id: number, dto: UpdateFormularioPreguntaDto) {
    const normalizedDto = {
      ...dto,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
    };

    return this.formularioPreguntaRepository.update(id, normalizedDto);
  }

  remove(id: number) {
    return this.formularioPreguntaRepository.update(id, { fp_estado: false });
  }
}
