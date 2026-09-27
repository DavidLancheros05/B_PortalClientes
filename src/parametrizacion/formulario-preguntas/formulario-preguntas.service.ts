import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FormularioPregunta } from './entities/formulario-pregunta.entity';
import { CreateFormularioPreguntaDto } from './dto/create-formulario-pregunta.dto';
import { UpdateFormularioPreguntaDto } from './dto/update-formulario-pregunta.dto';
import { normalizeMojibake } from 'src/common/utils/text-encoding.util';
import {
  contarSolicitudesQueBloqueanVersion,
  obtenerFormularioYVersionActiva,
  resolverFvId,
} from '../formularios/version-formulario.util';
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
    const { frs_id, fv_numero, ...dtoSinFormularioId } = dto;
    // La pregunta se amarra a su versión por fv_id; la API manda
    // formulario + número de versión.
    const versionNumero = fv_numero ?? 1;
    const fvId = frs_id
      ? await resolverFvId(
          this.formularioPreguntaRepository.manager,
          frs_id,
          versionNumero,
        )
      : null;
    if (!fvId) {
      throw new BadRequestException(
        `No existe la versión ${versionNumero} del formulario ${frs_id ?? '(sin formulario)'}.`,
      );
    }
    await this.assertSeccionDeLaVersion(dto.fp_fs_id, fvId);
    const normalizedDto = {
      ...dtoSinFormularioId,
      fp_fv_id: fvId,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
      fp_tabla_columnas: this.asegurarCodigosColumnasTabla(
        dto.fp_tabla_columnas,
      ),
      // Nunca se guarda el nombre de la base: el catálogo siempre se lee de
      // la base actual. Un nombre quemado rompió /maestros/catalogo al
      // cambiar de servidor.
      fp_catalogo_base_datos: null,
      fp_created_at: new Date(),
      ...(await this.derivarCondiciones(dto, null)),
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
    const activa = await obtenerFormularioYVersionActiva(
      this.formularioPreguntaRepository.manager,
    );
    if (!activa) return [];

    return this.findAll(activa.frs_id, activa.fv_numero, true);
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

    // La pregunta no guarda el formulario (fp_frs_id se eliminó): se llega
    // a él por su versión.
    if (formularioId && !version) {
      const versiones: { fv_id: number }[] =
        await this.formularioPreguntaRepository.manager.query(
          `SELECT fv_id FROM Formulario_versiones WHERE fv_frs_id = @0`,
          [formularioId],
        );
      if (versiones.length === 0) return [];
      where.fp_fv_id = In(versiones.map((v) => v.fv_id));
    }

    if (version) {
      if (!formularioId) {
        // Un número de versión sin formulario es ambiguo (cada formulario
        // tiene su propia v1, v2...).
        throw new BadRequestException(
          'Para filtrar por versión hay que indicar también el formulario.',
        );
      }
      const fvId = await resolverFvId(
        this.formularioPreguntaRepository.manager,
        formularioId,
        version,
      );
      if (!fvId) return [];
      where.fp_fv_id = fvId;
    }

    if (soloActivas) {
      where.fp_estado = true;
    }

    const preguntas = await this.formularioPreguntaRepository.find({
      where,
      order: { fp_fs_id: 'ASC', fp_orden: 'ASC' },
    });

    if (preguntas.length === 0) return [];

    const fpIds = preguntas.map((p) => p.fp_id);
    const seccionIds = [
      ...new Set(
        preguntas
          .map((p) => p.fp_fs_id)
          .filter((id): id is number => id != null),
      ),
    ];

    const fvIds = [...new Set(preguntas.map((p) => p.fp_fv_id))];
    const [opciones, secciones, versiones] = await Promise.all([
      this.formularioPreguntaRepository.manager
        .getRepository(FormularioPreguntaOpcion)
        .find({ where: { fpo_fp_id: In(fpIds) } }),
      seccionIds.length
        ? this.formularioPreguntaRepository.manager
            .getRepository(Seccion)
            .find({ where: { fs_id: In(seccionIds) } })
        : Promise.resolve([]),
      this.formularioPreguntaRepository.manager.query(
        `SELECT fv_id, fv_frs_id FROM Formulario_versiones
         WHERE fv_id IN (${fvIds.map((_, i) => `@${i}`).join(', ')})`,
        fvIds,
      ) as Promise<{ fv_id: number; fv_frs_id: number }[]>,
    ]);
    const formularioPorVersion = new Map(
      versiones.map((v) => [v.fv_id, v.fv_frs_id]),
    );

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
        p.fp_fs_id != null ? seccionPorId.get(p.fp_fs_id) : undefined;
      const motivoProteccion = p.fp_codigo
        ? (preguntasProtegidas.get(p.fp_codigo) ?? null)
        : null;

      return {
        ...p,
        // Campo de la API que usa el frontend; sale de la versión.
        frs_id: formularioPorVersion.get(p.fp_fv_id) ?? null,
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

    // Una pregunta no se cambia de formulario ni de versión al editarla: se
    // descartan esos campos para que fp_fv_id no quede desamarrado.
    const {
      frs_id: _frsId,
      fv_numero: _fvNumero,
      ...dtoEditable
    } = dto as UpdateFormularioPreguntaDto & { frs_id?: number };
    const [actual] = await this.formularioPreguntaRepository.manager.query(
      `SELECT fp_fv_id, fp_pregunta_padre_id, fp_valor_padre_disparador,
              fp_fpo_codigo_disparador, fp_tabla_limite_pregunta_id,
              fp_catalogo_filtro_pregunta_id
       FROM Formulario_pregunta WHERE fp_id = @0`,
      [id],
    );
    // undefined = no cambia de sección; null explícito se rechaza.
    if (dto.fp_fs_id !== undefined && actual) {
      await this.assertSeccionDeLaVersion(dto.fp_fs_id, actual.fp_fv_id);
    }
    const normalizedDto = {
      ...dtoEditable,
      fp_descripcion: dto.fp_descripcion
        ? normalizeMojibake(dto.fp_descripcion)
        : dto.fp_descripcion,
      fp_tabla_columnas: this.asegurarCodigosColumnasTabla(
        dto.fp_tabla_columnas,
      ),
      // Igual que en create: el catálogo siempre se lee de la base actual.
      fp_catalogo_base_datos: null,
      ...(await this.derivarCondiciones(dto, actual ?? null)),
    };

    return this.formularioPreguntaRepository.update(id, normalizedDto);
  }

  // Identidad estable por columna de una pregunta TABLA, análoga a
  // fp_codigo a nivel de pregunta — ver "Documentos Cartonera/
  // documentacion/Funcionalidades/codigo-estable-columnas-tabla.md".
  // fp_tabla_columnas es un JSON de texto editable libremente desde
  // Parametrización (etiqueta de columna, tipo, catálogo); sin esto, quien
  // lea las celdas de la respuesta solo puede anclar cada columna por su
  // etiqueta de texto, y un simple renombrado rompe la lectura en silencio.
  // Las celdas de la respuesta se guardan por este codigo. El editor no tiene
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
      // Las columnas tipo catálogo tampoco guardan base de datos (ver
      // fp_catalogo_base_datos en create).
      delete columna.catalogo_base_datos;
      return columna;
    });

    // Las celdas de la respuesta se guardan por codigo: dos columnas con
    // el mismo codigo compartirían la misma celda.
    const vistos = new Set<string>();
    for (const columna of conCodigo) {
      const codigo = String(columna.codigo);
      if (vistos.has(codigo)) {
        throw new BadRequestException(
          `Dos columnas de la tabla tienen el mismo código "${codigo}".`,
        );
      }
      vistos.add(codigo);
    }

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

  // Condiciones entre preguntas amarradas al código de la opción, no a su
  // texto. El editor
  // sigue mandando el texto (fp_valor_padre_disparador, "valor" de cada
  // regla): acá se deriva el fpo_codigo de la opción del padre con ese texto.
  // Si el texto no coincide con ninguna opción (p. ej. quedó viejo tras un
  // renombrado) se conserva el código que ya tenía, en vez de borrarlo. Solo
  // devuelve los campos que hay que escribir.
  private async derivarCondiciones(
    dto: Partial<CreateFormularioPreguntaDto>,
    actual: {
      fp_pregunta_padre_id: number | null;
      fp_valor_padre_disparador: string | null;
      fp_fpo_codigo_disparador: string | null;
      fp_tabla_limite_pregunta_id: number | null;
      fp_catalogo_filtro_pregunta_id: number | null;
    } | null,
  ): Promise<Record<string, unknown>> {
    const cambios: Record<string, unknown> = {};
    const toca = (campo: string) => campo in dto;

    if (
      toca('fp_pregunta_padre_id') ||
      toca('fp_valor_padre_disparador') ||
      toca('fp_fpo_codigo_disparador')
    ) {
      const padreId = toca('fp_pregunta_padre_id')
        ? (dto.fp_pregunta_padre_id ?? null)
        : (actual?.fp_pregunta_padre_id ?? null);
      const texto = toca('fp_valor_padre_disparador')
        ? (dto.fp_valor_padre_disparador ?? null)
        : (actual?.fp_valor_padre_disparador ?? null);
      const mismoPadre = padreId === (actual?.fp_pregunta_padre_id ?? null);
      const opciones = padreId ? await this.opcionesDe(padreId) : [];

      let codigo: string | null = null;
      if (toca('fp_fpo_codigo_disparador') && dto.fp_fpo_codigo_disparador) {
        const opcion = opciones.find(
          (o) => o.fpo_codigo === dto.fp_fpo_codigo_disparador,
        );
        if (!opcion) {
          throw new BadRequestException(
            `La opción "${dto.fp_fpo_codigo_disparador}" no pertenece a la pregunta padre.`,
          );
        }
        codigo = opcion.fpo_codigo;
        cambios.fp_valor_padre_disparador = opcion.fpo_valor;
      } else if (texto) {
        codigo =
          this.codigoPorTexto(opciones, texto) ??
          (mismoPadre ? (actual?.fp_fpo_codigo_disparador ?? null) : null);
      }
      cambios.fp_fpo_codigo_disparador = padreId ? codigo : null;
      // Con código, el texto guardado es siempre el actual de la opción
      // (aunque el editor haya mandado uno viejo).
      const opcionElegida = codigo
        ? opciones.find((o) => o.fpo_codigo === codigo)
        : undefined;
      if (opcionElegida) {
        cambios.fp_valor_padre_disparador = opcionElegida.fpo_valor;
      }
    }

    const reglas: [string, string][] = [
      ['fp_tabla_limite_reglas', 'fp_tabla_limite_pregunta_id'],
      ['fp_catalogo_filtro_reglas', 'fp_catalogo_filtro_pregunta_id'],
    ];
    for (const [campoReglas, campoPadre] of reglas) {
      if (!toca(campoReglas)) continue;
      const json = (dto as Record<string, unknown>)[campoReglas] as
        | string
        | null
        | undefined;
      const padreId = toca(campoPadre)
        ? ((dto as Record<string, unknown>)[campoPadre] as number | null)
        : ((actual as Record<string, unknown> | null)?.[campoPadre] as
            | number
            | null);
      cambios[campoReglas] = await this.agregarCodigoOpcionAReglas(
        json,
        padreId ?? null,
      );
    }

    return cambios;
  }

  private async opcionesDe(
    fpId: number,
  ): Promise<{ fpo_codigo: string; fpo_valor: string }[]> {
    return this.formularioPreguntaRepository.manager.query(
      `SELECT fpo_codigo, fpo_valor FROM Formulario_pregunta_opcion
       WHERE fpo_fp_id = @0 AND fpo_estado = 1 AND fpo_codigo IS NOT NULL`,
      [fpId],
    );
  }

  // Código de la única opción activa con ese texto (sin distinguir
  // mayúsculas ni espacios); null si no hay ninguna o hay varias.
  private codigoPorTexto(
    opciones: { fpo_codigo: string; fpo_valor: string }[],
    texto: string,
  ): string | null {
    const norm = (v: string) => (v ?? '').trim().toLowerCase();
    const coinciden = opciones.filter((o) => norm(o.fpo_valor) === norm(texto));
    return coinciden.length === 1 ? coinciden[0].fpo_codigo : null;
  }

  // Cada regla {valor, ...} gana opcion_codigo (la opción del padre con ese
  // texto). Una regla que ya trae opcion_codigo se valida y se le actualiza
  // el texto.
  private async agregarCodigoOpcionAReglas(
    json: string | null | undefined,
    padreId: number | null,
  ): Promise<string | null | undefined> {
    if (!json || !padreId) return json;
    let reglas: Record<string, unknown>[];
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) return json;
      reglas = parsed;
    } catch {
      return json;
    }
    const opciones = await this.opcionesDe(padreId);
    if (opciones.length === 0) return json; // padre sin opciones: va por texto

    const conCodigo = reglas.map((regla) => {
      const codigo =
        typeof regla.opcion_codigo === 'string' ? regla.opcion_codigo : null;
      if (codigo) {
        const opcion = opciones.find((o) => o.fpo_codigo === codigo);
        if (!opcion) {
          throw new BadRequestException(
            `La opción "${codigo}" de una regla no pertenece a la pregunta de la que depende.`,
          );
        }
        return { ...regla, valor: opcion.fpo_valor };
      }
      const derivado =
        typeof regla.valor === 'string'
          ? this.codigoPorTexto(opciones, regla.valor)
          : null;
      return derivado ? { ...regla, opcion_codigo: derivado } : regla;
    });
    return JSON.stringify(conCodigo);
  }

  // Las secciones son de cada versión: una pregunta no puede quedar en
  // la sección de otra versión, ni sin sección (fp_fs_id es NOT NULL y la
  // FK (fp_fs_id, fp_fv_id) lo exige también en la BD).
  private async assertSeccionDeLaVersion(
    seccionId: number | null | undefined,
    fvId: number,
  ) {
    if (seccionId == null) {
      throw new BadRequestException('La pregunta debe pertenecer a una sección.');
    }
    const [seccion] = await this.formularioPreguntaRepository.manager.query(
      `SELECT fs_fv_id FROM Formulario_secciones WHERE fs_id = @0`,
      [seccionId],
    );
    if (!seccion) {
      throw new BadRequestException(`La sección ${seccionId} no existe.`);
    }
    if (seccion.fs_fv_id !== fvId) {
      throw new BadRequestException(
        'La sección elegida pertenece a otra versión del formulario.',
      );
    }
  }

  // "Preguntas protegidas": fp_codigo anclado a lógica hardcodeada en el
  // backend (flujo del portal) o al envío de datos a SIESA — ver
  // preguntas-protegidas.constant.ts y "Documentos Cartonera/
  // documentacion/Portal Clientes/Formularios/preguntas-protegidas-editor.md". Cambiar
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
      `SELECT fp_fv_id FROM Formulario_pregunta WHERE fp_id = @0`,
      [fpId],
    );
    if (pregunta.length === 0) return;

    const total = await contarSolicitudesQueBloqueanVersion(
      this.formularioPreguntaRepository.manager,
      pregunta[0].fp_fv_id,
    );
    if (total > 0) {
      throw new Error(
        `No se puede ${accion} esta pregunta porque su versión del formulario ya tiene solicitudes asociadas. Creá una nueva versión del formulario para hacer cambios.`,
      );
    }
  }
}
