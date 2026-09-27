import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  contarSolicitudesQueBloqueanVersion,
  obtenerFormularioYVersionActiva,
  resolverFvId,
} from '../formularios/version-formulario.util';

export interface Seccion {
  fs_id: number;
  fs_nombre: string;
  fs_descripcion: string | null;
  fs_orden: number;
  fs_activo: boolean;
  fs_oculta_en_formulario: boolean;
  fs_fv_id: number | null;
}

// Desde la Fase 3 (plan-correccion-modelo-datos-formulario.md) cada sección
// pertenece a UNA versión del formulario (fs_fv_id), igual que sus preguntas:
// cambiar una sección de una versión con solicitudes cambiaría cómo se ven
// esas solicitudes, así que se bloquea con la misma regla que preguntas y
// opciones (assertVersionSinSolicitudes).
@Injectable()
export class FormularioSeccionesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // Secciones de la versión activa del formulario activo ("nueva
  // solicitud"). Mismo criterio que
  // FormularioPreguntasService.findPreguntasFormularioActivo.
  async listarFormularioActivo(): Promise<Seccion[]> {
    const activa = await obtenerFormularioYVersionActiva(this.dataSource);
    if (!activa) return [];
    return this.listar(activa.frs_id, activa.fv_numero);
  }

  // Con formulario + versión: solo las secciones de esa versión. Sin ellos:
  // todas (de todas las versiones). Quien arma un formulario a partir de sus
  // preguntas busca la sección por fs_id, así que tener las de otras
  // versiones en la lista no le cambia nada.
  async listar(
    formularioId?: number,
    versionNumero?: number,
  ): Promise<Seccion[]> {
    let fvId: number | null = null;
    if (versionNumero) {
      if (!formularioId) {
        throw new BadRequestException(
          'Para filtrar por versión hay que indicar también el formulario.',
        );
      }
      fvId = await resolverFvId(this.dataSource, formularioId, versionNumero);
      if (!fvId) return [];
    }

    return this.dataSource.query(
      `
      SELECT
        fs_id,
        fs_nombre,
        fs_descripcion,
        fs_orden,
        fs_activo,
        fs_oculta_en_formulario,
        fs_fv_id
      FROM Formulario_secciones
      ${fvId ? 'WHERE fs_fv_id = @0' : ''}
      ORDER BY fs_orden ASC
    `,
      fvId ? [fvId] : [],
    );
  }

  async crear(data: {
    seccion_nombre: string;
    seccion_descripcion?: string;
    seccion_orden: number;
    seccion_oculta_en_formulario?: boolean;
    formulario_id?: number;
    formulario_version?: number;
  }): Promise<Seccion> {
    const fvId = await this.resolverVersionDestino(
      data.formulario_id,
      data.formulario_version,
    );
    await this.assertVersionSinSolicitudes(fvId, 'crear secciones en');

    const result = await this.dataSource.query(
      `
      INSERT INTO Formulario_secciones (
        fs_nombre,
        fs_descripcion,
        fs_orden,
        fs_activo,
        fs_oculta_en_formulario,
        fs_fv_id,
        fs_created_at
      )
      OUTPUT
        INSERTED.fs_id,
        INSERTED.fs_nombre,
        INSERTED.fs_descripcion,
        INSERTED.fs_orden,
        INSERTED.fs_activo,
        INSERTED.fs_oculta_en_formulario,
        INSERTED.fs_fv_id
      VALUES (@0, @1, @2, 1, @3, @4, dbo.fn_ahora_colombia())
    `,
      [
        data.seccion_nombre,
        data.seccion_descripcion || null,
        data.seccion_orden,
        data.seccion_oculta_en_formulario ? 1 : 0,
        fvId,
      ],
    );
    return result[0];
  }

  async actualizar(
    id: number,
    data: {
      seccion_nombre?: string;
      seccion_descripcion?: string;
      seccion_orden?: number;
      seccion_activo?: boolean;
      seccion_oculta_en_formulario?: boolean;
    },
  ): Promise<Seccion> {
    await this.assertVersionDeSeccionSinSolicitudes(id, 'editar');

    let query = 'UPDATE Formulario_secciones SET ';
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 0;

    if (data.seccion_nombre !== undefined) {
      updates.push(`fs_nombre = @${paramIndex}`);
      params.push(data.seccion_nombre);
      paramIndex++;
    }
    if (data.seccion_descripcion !== undefined) {
      updates.push(`fs_descripcion = @${paramIndex}`);
      params.push(data.seccion_descripcion || null);
      paramIndex++;
    }
    if (data.seccion_orden !== undefined) {
      updates.push(`fs_orden = @${paramIndex}`);
      params.push(data.seccion_orden);
      paramIndex++;
    }
    if (data.seccion_activo !== undefined) {
      updates.push(`fs_activo = @${paramIndex}`);
      params.push(data.seccion_activo ? 1 : 0);
      paramIndex++;
    }
    if (data.seccion_oculta_en_formulario !== undefined) {
      updates.push(`fs_oculta_en_formulario = @${paramIndex}`);
      params.push(data.seccion_oculta_en_formulario ? 1 : 0);
      paramIndex++;
    }

    query += updates.join(', ');
    query += ` OUTPUT INSERTED.* WHERE fs_id = @${paramIndex}`;
    params.push(id);

    const result = await this.dataSource.query(query, params);
    return result[0];
  }

  async eliminar(id: number): Promise<boolean> {
    await this.assertVersionDeSeccionSinSolicitudes(id, 'eliminar');

    // FK_Formulario_pregunta_seccion (NO ACTION) ya impide dejar preguntas
    // huérfanas; esto solo cambia el error crudo de SQL Server por uno claro.
    // Cuenta también las preguntas desactivadas (fp_estado = 0): siguen
    // apuntando a la sección y la FK las ve igual.
    const enUso = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM Formulario_pregunta WHERE fp_fs_id = @0`,
      [id],
    );
    if (enUso[0].total > 0) {
      throw new ConflictException(
        `No se puede eliminar la sección porque tiene ${enUso[0].total} pregunta(s) asociada(s), incluidas las desactivadas. Moverlas a otra sección primero.`,
      );
    }

    // `result.rowsAffected` no viene como número plano con este driver — se
    // confirma el borrado con OUTPUT en vez de confiar en rowsAffected,
    // mismo patrón que crear()/actualizar() ya usan para leer el resultado.
    const result = await this.dataSource.query(
      `DELETE FROM Formulario_secciones OUTPUT DELETED.fs_id WHERE fs_id = @0`,
      [id],
    );
    // TypeORM (mssql) devuelve [filas, cantidad] cuando la consulta empieza
    // con DELETE: result.length era siempre 2 y nunca daba "no encontrada".
    const filas = Array.isArray(result[0]) ? result[0] : result;
    return filas.length > 0;
  }

  // Sin formulario ni versión (la pantalla global de Secciones) se usa la
  // versión activa del formulario activo: es la que esa pantalla mostraba
  // siempre.
  private async resolverVersionDestino(
    formularioId?: number,
    versionNumero?: number,
  ): Promise<number> {
    if (formularioId && versionNumero) {
      const fvId = await resolverFvId(
        this.dataSource,
        formularioId,
        versionNumero,
      );
      if (!fvId) {
        throw new BadRequestException(
          `No existe la versión ${versionNumero} del formulario ${formularioId}.`,
        );
      }
      return fvId;
    }

    // Con formulario pero sin versión: la activa de ESE formulario (el
    // editor abierto sin ?version= muestra esa).
    const activos = formularioId
      ? await this.dataSource.query(
          `SELECT frs_fv_id_activa FROM Formularios_solicitudes WHERE frs_id = @0`,
          [formularioId],
        )
      : await this.dataSource.query(
          `SELECT frs_fv_id_activa FROM Formularios_solicitudes WHERE frs_activo = 1`,
        );
    if (activos.length !== 1 || activos[0].frs_fv_id_activa == null) {
      throw new BadRequestException(
        'Indicá el formulario y la versión a la que pertenece la sección.',
      );
    }
    return activos[0].frs_fv_id_activa;
  }

  private async assertVersionDeSeccionSinSolicitudes(
    fsId: number,
    accion: string,
  ) {
    const seccion = await this.dataSource.query(
      `SELECT fs_fv_id FROM Formulario_secciones WHERE fs_id = @0`,
      [fsId],
    );
    if (seccion.length === 0 || seccion[0].fs_fv_id == null) return;
    await this.assertVersionSinSolicitudes(
      seccion[0].fs_fv_id,
      `${accion} secciones de`,
    );
  }

  private async assertVersionSinSolicitudes(fvId: number, accion: string) {
    const total = await contarSolicitudesQueBloqueanVersion(
      this.dataSource,
      fvId,
    );
    if (total > 0) {
      throw new ConflictException(
        `No se puede ${accion} esta versión del formulario porque ya tiene solicitudes asociadas. Creá una nueva versión del formulario para hacer cambios.`,
      );
    }
  }
}
