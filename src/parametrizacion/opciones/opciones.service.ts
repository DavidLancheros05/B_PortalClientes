import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormularioPreguntaOpcion } from './entities/formulario-pregunta-opcion.entity';
import { CreateFormularioPreguntaOpcionDto } from './dto/create-formulario-pregunta-opcion.dto';
import { UpdateFormularioPreguntaOpcionDto } from './dto/update-formulario-pregunta-opcion.dto';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';
import { contarSolicitudesQueBloqueanVersion } from '../formularios/version-formulario.util';

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

  async update(fpo_id: number, dto: UpdateFormularioPreguntaOpcionDto) {
    await this.assertVersionSinSolicitudes(fpo_id, 'editar');

    const normalizedDto = {
      ...dto,
      fpo_valor: dto.fpo_valor
        ? normalizeMojibake(dto.fpo_valor)
        : dto.fpo_valor,
    };

    return this.repo.update(fpo_id, normalizedDto);
  }

  async remove(fpo_id: number) {
    await this.assertVersionSinSolicitudes(fpo_id, 'eliminar');

    return this.repo.update(fpo_id, { fpo_estado: false });
  }

  // Mismo criterio que FormularioPreguntasService.assertVersionSinSolicitudes:
  // renombrar/eliminar una opción cambia lo que muestra el PDF de una
  // solicitud ya enviada (resolverValorRespuesta relee fpo_valor en vivo
  // por id, sin snapshot).
  private async assertVersionSinSolicitudes(fpoId: number, accion: string) {
    const opcion = await this.repo.manager.query(
      `
      SELECT ISNULL(fp.fp_version, 1) AS fp_version
      FROM Formulario_pregunta_opcion fpo
      JOIN Formulario_pregunta fp ON fp.fp_id = fpo.fpo_fp_id
      WHERE fpo.fpo_id = @0
      `,
      [fpoId],
    );
    if (opcion.length === 0) return;

    const total = await contarSolicitudesQueBloqueanVersion(
      this.repo.manager,
      opcion[0].fp_version,
    );
    if (total > 0) {
      throw new Error(
        `No se puede ${accion} esta opción porque su versión del formulario ya tiene solicitudes asociadas. Creá una nueva versión del formulario para hacer cambios.`,
      );
    }
  }
}
