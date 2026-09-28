import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { FormularioPreguntaOpcion } from './entities/formulario-pregunta-opcion.entity';
import { CreateFormularioPreguntaOpcionDto } from './dto/create-formulario-pregunta-opcion.dto';
import { UpdateFormularioPreguntaOpcionDto } from './dto/update-formulario-pregunta-opcion.dto';
import { AplicarCambiosOpcionesDto } from './dto/aplicar-cambios-opciones.dto';
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
      await this.sincronizarTextoEnDependientes(
        fpo_id,
        normalizedDto.fpo_valor,
      );
    }
    return resultado;
  }

  // Las condiciones van por fpo_codigo, así que renombrar la opción ya
  // no las rompe. Igual se actualiza el texto guardado junto al código
  // (fp_valor_padre_disparador y "valor" de las reglas) para que el editor
  // siga mostrando la opción correcta.
  private async sincronizarTextoEnDependientes(
    fpoId: number,
    valor: string,
    manager: EntityManager = this.repo.manager,
  ) {
    const [opcion] = await manager.query(
      `SELECT fpo_fp_id, fpo_codigo FROM Formulario_pregunta_opcion WHERE fpo_id = @0`,
      [fpoId],
    );
    if (!opcion?.fpo_codigo) return;

    await manager.query(
      `UPDATE Formulario_pregunta SET fp_valor_padre_disparador = @0
       WHERE fp_pregunta_padre_id = @1 AND fp_fpo_codigo_disparador = @2`,
      [valor, opcion.fpo_fp_id, opcion.fpo_codigo],
    );

    for (const [columnaReglas, columnaPadre] of [
      ['fp_tabla_limite_reglas', 'fp_tabla_limite_pregunta_id'],
      ['fp_catalogo_filtro_reglas', 'fp_catalogo_filtro_pregunta_id'],
    ]) {
      const preguntas: { fp_id: number; reglas: string }[] =
        await manager.query(
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
          if (r.opcion_codigo !== opcion.fpo_codigo || r.valor === valor)
            return r;
          cambio = true;
          return { ...r, valor };
        });
        if (cambio) {
          await manager.query(
            `UPDATE Formulario_pregunta SET ${columnaReglas} = @0 WHERE fp_id = @1`,
            [JSON.stringify(nuevas), pregunta.fp_id],
          );
        }
      }
    }
  }

  // Aplica en una sola transacción lo que el editor acumuló al editar una
  // pregunta: o queda todo guardado o nada (varias llamadas sueltas dejaban
  // cambios a medias si una fallaba). Las opciones se identifican por
  // fpo_id, no por texto: un renombre conserva fpo_codigo, que es de lo que
  // cuelgan las preguntas dependientes y las reglas.
  async aplicarCambios(fpId: number, dto: AplicarCambiosOpcionesDto) {
    const eliminar = [...new Set(dto.eliminar)];
    const renombrar = dto.renombrar
      .map((r) => ({
        fpo_id: r.fpo_id,
        fpo_valor: normalizeMojibake(r.fpo_valor.trim()),
      }))
      .filter((r) => r.fpo_valor && !eliminar.includes(r.fpo_id));
    const crear = [
      ...new Set(
        dto.crear.map((v) => normalizeMojibake(v.trim())).filter(Boolean),
      ),
    ];

    await this.repo.manager.transaction(async (manager) => {
      const pregunta: { fp_fv_id: number }[] = await manager.query(
        `SELECT fp_fv_id FROM Formulario_pregunta WHERE fp_id = @0`,
        [fpId],
      );
      if (pregunta.length === 0) {
        throw new BadRequestException('La pregunta no existe');
      }

      // Solo se tocan opciones de esta pregunta: los endpoints sueltos no
      // validaban que el fpo_id perteneciera al :id de la ruta.
      const idsAfectados = [
        ...new Set([...eliminar, ...renombrar.map((r) => r.fpo_id)]),
      ];
      if (idsAfectados.length > 0) {
        const propias: { fpo_id: number }[] = await manager.query(
          `SELECT fpo_id FROM Formulario_pregunta_opcion
           WHERE fpo_fp_id = @0 AND fpo_estado = 1
             AND fpo_id IN (${idsAfectados.map((_, i) => `@${i + 1}`).join(', ')})`,
          [fpId, ...idsAfectados],
        );
        if (propias.length !== idsAfectados.length) {
          throw new BadRequestException(
            'Alguna de las opciones no pertenece a esta pregunta o ya fue eliminada. Recarga el editor.',
          );
        }

        // Mismo criterio que update/remove: crear opciones no cambia lo que
        // muestran las solicitudes ya enviadas, renombrar o eliminar sí.
        const total = await contarSolicitudesQueBloqueanVersion(
          manager,
          pregunta[0].fp_fv_id,
        );
        if (total > 0) {
          throw new BadRequestException(
            'No se pueden editar ni eliminar opciones porque esta versión del formulario ya tiene solicitudes asociadas. Creá una nueva versión del formulario para hacer cambios.',
          );
        }
      }

      const repo = manager.getRepository(FormularioPreguntaOpcion);

      for (const r of renombrar) {
        const [anterior]: { fpo_valor: string; fpo_codigo: string | null }[] =
          await manager.query(
            `SELECT fpo_valor, fpo_codigo FROM Formulario_pregunta_opcion WHERE fpo_id = @0`,
            [r.fpo_id],
          );
        await repo.update(r.fpo_id, { fpo_valor: r.fpo_valor });
        await this.sincronizarTextoEnDependientes(
          r.fpo_id,
          r.fpo_valor,
          manager,
        );
        // Dependientes viejas sin fp_fpo_codigo_disparador se evalúan por
        // texto: se les actualiza el texto (como hacía antes el editor) y de
        // paso quedan amarradas por código.
        const textoAnterior = (anterior?.fpo_valor ?? '').trim();
        if (textoAnterior) {
          await manager.query(
            `UPDATE Formulario_pregunta
             SET fp_valor_padre_disparador = @0, fp_fpo_codigo_disparador = @3
             WHERE fp_pregunta_padre_id = @1 AND fp_fpo_codigo_disparador IS NULL
               AND LTRIM(RTRIM(fp_valor_padre_disparador)) = @2`,
            [r.fpo_valor, fpId, textoAnterior, anterior?.fpo_codigo ?? null],
          );
        }
      }

      for (const valor of crear) {
        const creada = await repo.save({
          fpo_fp_id: fpId,
          fpo_valor: valor,
          fpo_estado: true,
        });
        if (!creada.fpo_codigo) {
          await repo.update(creada.fpo_id, {
            fpo_codigo: `AUTO_O${creada.fpo_id}`,
          });
        }
      }

      for (const fpoId of eliminar) {
        await repo.update(fpoId, { fpo_estado: false });
      }
    });

    return this.findByPregunta(fpId);
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
