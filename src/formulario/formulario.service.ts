import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class FormularioService {
  constructor(private readonly dataSource: DataSource) {}

  async getSeccionesConPreguntas(formularioId: number) {
    const secciones = await this.dataSource.query(
      `SELECT
        s.fs_id,
        s.fs_nombre,
        CAST(s.fs_descripcion AS VARCHAR(MAX)) AS fs_descripcion,
        s.fs_orden
      FROM Formulario_secciones s
      INNER JOIN Formulario_pregunta fp ON fp.seccion_id = s.fs_id
      WHERE fp.formulario_id = @0
        AND s.fs_activo = 1
        AND fp.fp_estado = 1
      GROUP BY
        s.fs_id,
        s.fs_nombre,
        CAST(s.fs_descripcion AS VARCHAR(MAX)),
        s.fs_orden
      ORDER BY s.fs_orden`,
      [formularioId],
    );

    console.log('correccion secciones', secciones);

    if (secciones.length === 0) return [];

    const preguntas = await this.dataSource.query(
      `SELECT
        fp.fp_id,
        fp.seccion_id,
        fp.fp_descripcion,
        fp.fp_descripcion_adicional,
        fp.fp_tipo,
        fp.fp_subtipo,
        fp.fp_orden,
        fp.fp_requerida,
        fp.fp_minimo,
        fp.fp_maximo,
        fp.fp_patron,
        fp.fp_tabla_maestro,
        fp.fp_opcion_disparadora,
        fp.fp_validacion_adicional,
        fp.fp_pregunta_padre_id,
        fp.fp_valor_padre_disparador,
        fp.fp_catalogo_base_datos,
        fp.fp_catalogo_tabla,
        fp.fp_catalogo_columna,
        fp.fp_tipo_documento_id,
        fp.fp_precarga_fuente,
        fp.fp_precarga_campo_cliente,
        fp.fp_version
       FROM Formulario_pregunta fp
       WHERE fp.formulario_id = @0
         AND fp.fp_estado = 1
       ORDER BY fp.seccion_id, fp.fp_orden`,
      [formularioId],
    );

    return secciones.map((s: any) => ({
      ...s,
      preguntas: preguntas.filter((p: any) => p.seccion_id === s.fs_id),
    }));
  }
}
