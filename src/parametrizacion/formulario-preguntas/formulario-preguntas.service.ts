import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { FormularioPregunta } from './entities/formulario-pregunta.entity';
import { CreateFormularioPreguntaDto } from './dto/create-formulario-pregunta.dto';
import { UpdateFormularioPreguntaDto } from './dto/update-formulario-pregunta.dto';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';
import { contarSolicitudesQueBloqueanVersion } from '../formularios/version-formulario.util';
import { FormularioPreguntaOpcion } from '../opciones/entities/formulario-pregunta-opcion.entity';
import { Seccion } from '../formulario-secciones/entities/seccion.entity';
import {
  mapaPreguntasProtegidas,
  motivoProteccionPregunta,
} from './preguntas-protegidas.constant';

@Injectable()
export class FormularioPreguntasService {
  constructor(
    @InjectRepository(FormularioPregunta)
    private readonly formularioPreguntaRepository: Repository<FormularioPregunta>,
  ) {}

  async create(dto: CreateFormularioPreguntaDto) {
    const { frs_id, ...dtoSinFormularioId } = dto;
    const normalizedDto = {
      ...dtoSinFormularioId,
      fp_frs_id: frs_id,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
      fp_tabla_columnas: this.asegurarCodigosColumnasTabla(
        dto.fp_tabla_columnas,
      ),
      fp_created_at: new Date(),
    };

    const creada = await this.formularioPreguntaRepository.save(normalizedDto);

    // Toda pregunta necesita una identidad estable entre versiones de
    // formulario (fp_codigo no cambia al clonar una versión nueva, fp_id
    // sí — ver migrations/20260727_backfill_fp_codigo_identidad_entre_versiones.sql).
    // El editor de formularios no tiene ningún campo para asignarlo a
    // mano, así que se genera aquí automáticamente si quedó vacío, para
    // que la precarga de Ampliación de Cupo no dependa de fp_id solo
    // (que se rompe apenas se active una versión distinta a la que se
    // usó para la última solicitud aprobada del cliente).
    if (!creada.fp_codigo) {
      creada.fp_codigo = `AUTO_Q${creada.fp_id}`;
      await this.formularioPreguntaRepository.update(creada.fp_id, {
        fp_codigo: creada.fp_codigo,
      });
    }

    return creada;
  }

  // Preguntas del formulario activo (la única que se usa hoy en "nueva
  // solicitud"), en su última versión — usado por el selector de variables
  // de plantillas de documentos, que necesita referenciar cualquier
  // pregunta ya respondida sin que el usuario tenga que saber el
  // formularioId/versión de memoria.
  async findPreguntasFormularioActivo() {
    const result = await this.formularioPreguntaRepository.manager.query(`
      SELECT TOP 1
        f.frs_id AS frs_id,
        ISNULL(
          f.frs_version_activa,
          (SELECT MAX(fv.fv_numero) FROM Formulario_versiones fv WHERE fv.fv_frs_id = f.frs_id)
        ) AS version
      FROM Formularios_solicitudes f
      WHERE f.frs_activo = 1
      ORDER BY f.frs_id
    `);
    const formularioId = result?.[0]?.frs_id;
    const version = result?.[0]?.version || 1;
    if (!formularioId) return [];

    return this.findAll(formularioId, version, true);
  }

  async findAll(
    formularioId?: number,
    version?: number,
    soloActivas: boolean = true,
  ) {
    // Nunca usar leftJoinAndSelect (ni relationLoadStrategy: 'query', que
    // se probó acá y resultó devolver `opciones` siempre vacío — bug de
    // TypeORM 0.3.28 con esta combinación de relaciones, no reintentar).
    // fp tiene varias columnas nvarchar(MAX) (fp_descripcion,
    // fp_tabla_columnas, etc.) y un JOIN con opciones multiplica filas —
    // combinar ambas cosas hace que SQL Server tarde >15s y el endpoint
    // responda 500 (timeout) incluso con ~140 preguntas (reproducido
    // contra la BD de BACKEND/.env). Acá se arma a mano con 3 consultas
    // independientes (preguntas, opciones, secciones) y se mergea en JS —
    // sin JOIN no hay multiplicación de filas, y cada consulta es simple.
    const where: Record<string, unknown> = {};

    if (formularioId) {
      where.fp_frs_id = formularioId;
    }

    if (version) {
      where.fp_version = Raw((alias) => `ISNULL(${alias}, 1) = :version`, {
        version,
      });
    }

    if (soloActivas) {
      where.fp_estado = true;
    }

    const preguntas = await this.formularioPreguntaRepository.find({
      where,
      order: { seccion_id: 'ASC', fp_orden: 'ASC' },
    });

    if (preguntas.length === 0) return [];

    const fpIds = preguntas.map((p) => p.fp_id);
    const seccionIds = [
      ...new Set(
        preguntas
          .map((p) => p.seccion_id)
          .filter((id): id is number => id != null),
      ),
    ];

    const [opciones, secciones] = await Promise.all([
      this.formularioPreguntaRepository.manager
        .getRepository(FormularioPreguntaOpcion)
        .find({ where: { fpo_fp_id: In(fpIds) } }),
      seccionIds.length
        ? this.formularioPreguntaRepository.manager
            .getRepository(Seccion)
            .find({ where: { fs_id: In(seccionIds) } })
        : Promise.resolve([]),
    ]);

    const opcionesPorPregunta = new Map<number, FormularioPreguntaOpcion[]>();
    for (const opcion of opciones) {
      const lista = opcionesPorPregunta.get(opcion.fpo_fp_id) ?? [];
      lista.push(opcion);
      opcionesPorPregunta.set(opcion.fpo_fp_id, lista);
    }
    const seccionPorId = new Map(secciones.map((s) => [s.fs_id, s]));
    const preguntasProtegidas = await mapaPreguntasProtegidas(
      this.formularioPreguntaRepository.manager,
    );

    return preguntas.map((p) => {
      const seccion =
        p.seccion_id != null ? seccionPorId.get(p.seccion_id) : undefined;
      const motivoProteccion = p.fp_codigo
        ? (preguntasProtegidas.get(p.fp_codigo) ?? null)
        : null;

      return {
        ...p,
        // Keep the legacy API field while the database uses fp_frs_id.
        frs_id: p.fp_frs_id,
        fp_protegida: motivoProteccion !== null,
        fp_protegida_motivo: motivoProteccion,
        seccion_nombre: seccion?.fs_nombre ?? null,
        seccion_descripcion: seccion?.fs_descripcion ?? null,
        seccion_orden: seccion?.fs_orden ?? null,
        seccion_oculta_en_formulario: seccion?.fs_oculta_en_formulario ?? false,
        opciones: (opcionesPorPregunta.get(p.fp_id) ?? [])
          .filter((o) => o.fpo_estado)
          .map((o) => ({
            op_id: o.fpo_id,
            op_descripcion: normalizeMojibake(o.fpo_valor),
            op_codigo: o.fpo_codigo,
          })),
      };
    });
  }

  // Vista de solo lectura para la pantalla "Preguntas Reservadas" —
  // devuelve la tabla formulario_preguntas_reservadas completa, con el
  // nombre/tipo de la pregunta real si existe (la más reciente que
  // coincida por fp_codigo, cualquier versión) para que sea legible sin
  // tener que buscar el código a mano.
  async findReservadas() {
    return this.formularioPreguntaRepository.manager.query(`
      SELECT
        r.fpr_id,
        r.fpr_codigo,
        r.fpr_motivo,
        r.fpr_descripcion,
        r.fpr_activo,
        fp.fp_descripcion,
        fp.fp_tipo,
        fp.fp_estado
      FROM formulario_preguntas_reservadas r
      OUTER APPLY (
        SELECT TOP 1 fp_descripcion, fp_tipo, fp_estado
        FROM Formulario_pregunta
        WHERE fp_codigo = r.fpr_codigo
        ORDER BY fp_id DESC
      ) fp
      WHERE r.fpr_activo = 1
      ORDER BY r.fpr_motivo, r.fpr_codigo
    `);
  }

  async findOne(id: number) {
    const row = await this.formularioPreguntaRepository.findOne({
      where: { fp_id: id },
      relations: ['opciones'],
    });

    if (!row) return row;

    const motivoProteccion = await motivoProteccionPregunta(
      this.formularioPreguntaRepository.manager,
      row.fp_codigo,
    );

    return {
      ...row,
      fp_protegida: motivoProteccion !== null,
      fp_protegida_motivo: motivoProteccion,
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
    await this.assertNoCambiaTipoPreguntaProtegida(id, dto);

    const normalizedDto = {
      ...dto,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
      fp_tabla_columnas: this.asegurarCodigosColumnasTabla(
        dto.fp_tabla_columnas,
      ),
    };

    return this.formularioPreguntaRepository.update(id, normalizedDto);
  }

  // Identidad estable por columna de una pregunta TABLA, análoga a
  // fp_codigo a nivel de pregunta — ver "Documentos Cartonera/
  // documentacion/Funcionalidades/codigo-estable-columnas-tabla.md".
  // fp_tabla_columnas es un JSON de texto editable libremente desde
  // Parametrización (etiqueta de columna, tipo, catálogo); sin esto,
  // ClienteDatosNormalizadosService (BACKEND/src/cliente-datos-
  // normalizados) solo puede anclar cada columna por su etiqueta de texto,
  // y un simple renombrado rompe el mapeo en silencio. El editor no tiene
  // (ni necesita) un campo para asignar este código a mano — se genera
  // solo, igual que fp_codigo.
  private asegurarCodigosColumnasTabla(
    fpTablaColumnas: string | null | undefined,
  ): string | null | undefined {
    if (!fpTablaColumnas) return fpTablaColumnas;

    let columnas: unknown[];
    try {
      const parsed = JSON.parse(fpTablaColumnas);
      if (!Array.isArray(parsed)) return fpTablaColumnas;
      columnas = parsed;
    } catch {
      return fpTablaColumnas;
    }

    // Consecutivo por pregunta ("1", "2", ...), no aleatorio: se calcula
    // escaneando los códigos puramente numéricos que ya existan en ESTE
    // array y siguiendo desde el máximo. No hace falta contador externo —
    // cada fp_tabla_columnas es su propio universo, y solo se puede editar
    // mientras la versión no tenga solicitudes
    // (assertVersionSinSolicitudes), así que un número "reciclado" tras
    // borrar una columna nunca choca con una solicitud real ya guardada.
    let consecutivo = 0;
    for (const c of columnas) {
      const codigo = typeof c === 'object' && c ? (c as any).codigo : undefined;
      if (typeof codigo === 'string' && /^\d+$/.test(codigo)) {
        consecutivo = Math.max(consecutivo, Number(codigo));
      }
    }

    const conCodigo = columnas.map((c) => {
      const columna: Record<string, unknown> =
        typeof c === 'string'
          ? { nombre: c, tipo: 'TEXTO' }
          : { ...(c as object) };
      if (!columna.codigo) {
        consecutivo += 1;
        columna.codigo = String(consecutivo);
      }
      return columna;
    });

    return JSON.stringify(conCodigo);
  }

  async remove(id: number) {
    await this.assertVersionSinSolicitudes(id, 'eliminar');

    const pregunta = await this.formularioPreguntaRepository.findOne({
      where: { fp_id: id },
      select: ['fp_id', 'fp_codigo'],
    });
    const motivo = await motivoProteccionPregunta(
      this.formularioPreguntaRepository.manager,
      pregunta?.fp_codigo,
    );
    if (motivo) {
      throw new Error(this.mensajeProteccion(motivo, 'eliminar o desactivar'));
    }

    return this.formularioPreguntaRepository.update(id, { fp_estado: false });
  }

  // "Preguntas protegidas": fp_codigo anclado a lógica hardcodeada en el
  // backend (flujo del portal) o al envío de datos a SIESA — ver
  // preguntas-protegidas.constant.ts y "Documentos Cartonera/
  // documentacion/Funcionalidades/preguntas-protegidas-editor.md". Cambiar
  // el tipo de input, o eliminar la pregunta, rompe esa lógica sin aviso
  // (o, para las de SIESA, recién falla semanas después al intentar
  // activar la versión). El resto de campos (etiqueta, sección,
  // obligatoria, opciones, etc.) se puede seguir editando sin restricción.
  private async assertNoCambiaTipoPreguntaProtegida(
    id: number,
    dto: UpdateFormularioPreguntaDto,
  ) {
    if (dto.fp_tipo === undefined) return;

    const pregunta = await this.formularioPreguntaRepository.findOne({
      where: { fp_id: id },
      select: ['fp_id', 'fp_codigo', 'fp_tipo'],
    });
    if (!pregunta || dto.fp_tipo === pregunta.fp_tipo) return;

    const motivo = await motivoProteccionPregunta(
      this.formularioPreguntaRepository.manager,
      pregunta.fp_codigo,
    );
    if (motivo) {
      throw new Error(
        this.mensajeProteccion(motivo, 'cambiarle el tipo de input a'),
      );
    }
  }

  private mensajeProteccion(
    motivo: 'flujo' | 'siesa' | 'flujo_siesa',
    accion: string,
  ): string {
    const razon =
      motivo === 'flujo'
        ? 'está ligada al flujo interno del portal'
        : motivo === 'siesa'
          ? 'sus datos se envían a SIESA'
          : 'está ligada al flujo interno del portal y sus datos se envían a SIESA';
    return `No se puede ${accion} esta pregunta porque ${razon}. Si necesitás un campo distinto, creá una pregunta nueva en vez de modificar esta.`;
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
