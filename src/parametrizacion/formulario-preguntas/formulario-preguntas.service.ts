import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormularioPregunta } from './entities/formulario-pregunta.entity';
import { CreateFormularioPreguntaDto } from './dto/create-formulario-pregunta.dto';
import { UpdateFormularioPreguntaDto } from './dto/update-formulario-pregunta.dto';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';
import { contarSolicitudesQueBloqueanVersion } from '../formularios/version-formulario.util';

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

  // Preguntas del formulario activo (la única que se usa hoy en "nueva
  // solicitud"), en su última versión — usado por el selector de variables
  // de plantillas de documentos, que necesita referenciar cualquier
  // pregunta ya respondida sin que el usuario tenga que saber el
  // formularioId/versión de memoria.
  async findPreguntasFormularioActivo() {
    const result = await this.formularioPreguntaRepository.manager.query(`
      SELECT TOP 1
        f.frm_id AS formulario_id,
        ISNULL(
          f.frm_version_activa,
          (SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frm_id = f.frm_id)
        ) AS version
      FROM formularios f
      WHERE f.frm_activo = 1
      ORDER BY f.frm_id
    `);
    const formularioId = result?.[0]?.formulario_id;
    const version = result?.[0]?.version || 1;
    if (!formularioId) return [];

    return this.findAll(formularioId, version, true);
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

  async update(id: number, dto: UpdateFormularioPreguntaDto) {
    await this.assertVersionSinSolicitudes(id, 'editar');

    const normalizedDto = {
      ...dto,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
    };

    return this.formularioPreguntaRepository.update(id, normalizedDto);
  }

  async remove(id: number) {
    await this.assertVersionSinSolicitudes(id, 'eliminar');

    return this.formularioPreguntaRepository.update(id, { fp_estado: false });
  }

  // El PDF de una solicitud relee las preguntas EN VIVO (no guarda una foto
  // de cómo eran al momento de responder) — si se edita/elimina una
  // pregunta cuya versión ya tiene solicitudes reales, el PDF de una
  // solicitud enviada hace meses empieza a mostrar el texto/tipo nuevo, y
  // "eliminar" (soft delete) deja la respuesta ya dada invisible. La
  // salida segura es "crear nueva versión" desde Parametrización.
  private async assertVersionSinSolicitudes(fpId: number, accion: string) {
    const pregunta = await this.formularioPreguntaRepository.manager.query(
      `SELECT ISNULL(fp_version, 1) AS fp_version FROM Formulario_pregunta WHERE fp_id = @0`,
      [fpId],
    );
    if (pregunta.length === 0) return;

    const total = await contarSolicitudesQueBloqueanVersion(
      this.formularioPreguntaRepository.manager,
      pregunta[0].fp_version,
    );
    if (total > 0) {
      throw new Error(
        `No se puede ${accion} esta pregunta porque su versión del formulario ya tiene solicitudes asociadas. Creá una nueva versión del formulario para hacer cambios.`,
      );
    }
  }
}
