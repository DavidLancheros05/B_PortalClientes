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

  async create(dto: CreateFormularioPreguntaOpcionDto) {
    const normalizedDto = {
      ...dto,
      fpo_valor: normalizeMojibake(dto.fpo_valor),
      fpo_estado: dto.fpo_estado ?? true,
    };

    const creada = await this.repo.save(normalizedDto);

    // Misma razón que FormularioPreguntasService.create: no hay forma en el
    // editor de asignar fpo_codigo a mano, así que se genera solo para que
    // la opción tenga identidad estable entre versiones desde que nace.
    if (!creada.fpo_codigo) {
      creada.fpo_codigo = `AUTO_O${creada.fpo_id}`;
      await this.repo.update(creada.fpo_id, { fpo_codigo: creada.fpo_codigo });
    }

    return creada;
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

    const resultado = await this.repo.update(fpo_id, normalizedDto);
    if (normalizedDto.fpo_valor) {
      await this.sincronizarTextoEnDependientes(fpo_id, normalizedDto.fpo_valor);
    }
    return resultado;
  }

  // Las condiciones van por fpo_codigo (Fase 5,
  // plan-correccion-modelo-datos-formulario.md), así que renombrar la opción
  // ya no las rompe. Igual se actualiza el texto guardado junto al código
  // (fp_valor_padre_disparador y "valor" de las reglas) para que el editor
  // siga mostrando la opción correcta.
  private async sincronizarTextoEnDependientes(fpoId: number, valor: string) {
    const [opcion] = await this.repo.manager.query(
      `SELECT fpo_fp_id, fpo_codigo FROM Formulario_pregunta_opcion WHERE fpo_id = @0`,
      [fpoId],
    );
    if (!opcion?.fpo_codigo) return;

    await this.repo.manager.query(
      `UPDATE Formulario_pregunta SET fp_valor_padre_disparador = @0
       WHERE fp_pregunta_padre_id = @1 AND fp_fpo_codigo_disparador = @2`,
      [valor, opcion.fpo_fp_id, opcion.fpo_codigo],
    );

    for (const [columnaReglas, columnaPadre] of [
      ['fp_tabla_limite_reglas', 'fp_tabla_limite_pregunta_id'],
      ['fp_catalogo_filtro_reglas', 'fp_catalogo_filtro_pregunta_id'],
    ]) {
      const preguntas: { fp_id: number; reglas: string }[] =
        await this.repo.manager.query(
          `SELECT fp_id, ${columnaReglas} AS reglas FROM Formulario_pregunta
           WHERE ${columnaPadre} = @0 AND ${columnaReglas} IS NOT NULL`,
          [opcion.fpo_fp_id],
        );
      for (const pregunta of preguntas) {
        let reglas: Record<string, unknown>[];
        try {
          reglas = JSON.parse(pregunta.reglas);
          if (!Array.isArray(reglas)) continue;
        } catch {
          continue;
        }
        let cambio = false;
        const nuevas = reglas.map((r) => {
          if (r.opcion_codigo !== opcion.fpo_codigo || r.valor === valor) return r;
          cambio = true;
          return { ...r, valor };
        });
        if (cambio) {
          await this.repo.manager.query(
            `UPDATE Formulario_pregunta SET ${columnaReglas} = @0 WHERE fp_id = @1`,
            [JSON.stringify(nuevas), pregunta.fp_id],
          );
        }
      }
    }
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
      SELECT fp.fp_fv_id
      FROM Formulario_pregunta_opcion fpo
      JOIN Formulario_pregunta fp ON fp.fp_id = fpo.fpo_fp_id
      WHERE fpo.fpo_id = @0
      `,
      [fpoId],
    );
    if (opcion.length === 0) return;

    const total = await contarSolicitudesQueBloqueanVersion(
      this.repo.manager,
      opcion[0].fp_fv_id,
    );
    if (total > 0) {
      throw new Error(
        `No se puede ${accion} esta opción porque su versión del formulario ya tiene solicitudes asociadas. Creá una nueva versión del formulario para hacer cambios.`,
      );
    }
  }
}
