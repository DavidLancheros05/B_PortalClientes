import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface PreguntaRenderizable {
  fp_id: number;
  fp_tipo: string;
  fp_descripcion: string;
  fp_descripcion_adicional?: string | null;
  seccion_id: number;
  fp_orden: number;
  fp_requerida: boolean;

  // Visibilidad
  es_visible: boolean;
  fp_pregunta_padre_id?: number | null;
  fp_valor_padre_disparador?: string | null;

  // Respuesta resuelta
  valor_resuelto: string;
  tiene_respuesta: boolean;

  // Catálogos (para SELECT_TABLA)
  fp_catalogo_tabla?: string | null;
  fp_catalogo_columna?: string | null;
  fp_catalogo_pk_column?: string | null;

  // Datos estructurados (para fp_tipo === 'TABLA')
  tabla_columnas?: string[];
  tabla_filas?: Record<string, string>[];

  // Imagen cargada (para fp_tipo === 'IMAGEN')
  imagen_ruta?: string | null;
  imagen_tipo_mime?: string | null;
}

export interface FormularioRenderable {
  sol_id: number;
  sol_numero_solicitud: string;
  cliente_nombre: string;
  centro_operacion_nombre: string;
  formulario_nombre: string;
  formulario_version: number;
  preguntas: PreguntaRenderizable[];
}

@Injectable()
export class FormularioRenderizableService {
  constructor(private dataSource: DataSource) {}

  async obtenerFormularioRenderizable(
    solicitudId: number,
  ): Promise<FormularioRenderable> {
    // 1. Obtener información de la solicitud
    const solicitud = await this.dataSource.query(
      `SELECT
        sol_id, sol_numero_solicitud, cli_razon_social, cop_nombre
      FROM solicitudes s
      LEFT JOIN Clientes c ON c.cli_id = s.sol_cliente_id
      LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
      WHERE s.sol_id = @0`,
      [solicitudId],
    );

    if (!solicitud || solicitud.length === 0) {
      throw new Error('Solicitud no encontrada');
    }

    const { sol_numero_solicitud, cli_razon_social, cop_nombre } = solicitud[0];

    // 2. Obtener versión del formulario
    const formularioVersion = await this.dataSource.query(
      `SELECT sol_formulario_version FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );
    const version = formularioVersion[0]?.sol_formulario_version || 1;

    // 3. Obtener formulario ID y nombre
    const formResult = await this.dataSource.query(
      `SELECT fv_frm_id FROM Formulario_versiones
       WHERE fv_numero = @0 AND fv_frm_id IN (
         SELECT frm_id FROM formularios WHERE frm_activo = 1
       )`,
      [version],
    );
    const formularioId = formResult[0]?.fv_frm_id;

    // Obtener nombre del formulario
    let formularioNombre = 'Formulario';
    if (formularioId) {
      const formNameResult = await this.dataSource.query(
        `SELECT frm_nombre FROM formularios WHERE frm_id = @0`,
        [formularioId],
      );
      const rawNombre = formNameResult[0]?.frm_nombre || 'Formulario';
      // Limpiar: tomar solo la primera línea y remover espacios extras
      formularioNombre = rawNombre.split('\n')[0].trim();
    }

    // 4. Obtener preguntas CON campos de dependencia
    const preguntas = await this.dataSource.query(
      `SELECT
        fp.fp_id,
        fp.seccion_id,
        fp.fp_descripcion,
        fp.fp_descripcion_adicional,
        fp.fp_tipo,
        fp.fp_orden,
        fp.fp_requerida,
        fp.fp_pregunta_padre_id,
        fp.fp_valor_padre_disparador,
        fp.fp_catalogo_tabla,
        fp.fp_catalogo_columna,
        fp.fp_catalogo_pk_column,
        fp.fp_tabla_columnas
      FROM Formulario_pregunta fp
      WHERE fp.formulario_id = @0
        AND fp.fp_estado = 1
        AND fp.fp_version = @1
      ORDER BY fp.seccion_id, fp.fp_orden`,
      [formularioId, version],
    );

    // 5. Obtener respuestas
    const respuestas = await this.dataSource.query(
      `SELECT
        fr.fr_fp_id,
        fr.fr_valor_texto,
        fr.fr_valor_numero,
        fr.fr_valor_fecha,
        fr.fr_valor_opcion_id,
        fr.fr_valor_archivo_id,
        fp.fp_tipo,
        fp.fp_catalogo_tabla,
        fp.fp_catalogo_columna,
        fp.fp_catalogo_pk_column
      FROM (
        SELECT
          fr_fp_id,
          fr_valor_texto,
          fr_valor_numero,
          fr_valor_fecha,
          fr_valor_opcion_id,
          fr_valor_archivo_id,
          ROW_NUMBER() OVER (PARTITION BY fr_fp_id ORDER BY fr_updated_at DESC) AS rn
        FROM Formulario_respuesta
        WHERE fr_solicitud_id = @0
      ) fr
      LEFT JOIN Formulario_pregunta fp ON fr.fr_fp_id = fp.fp_id
      WHERE fr.rn = 1`,
      [solicitudId],
    );

    // 5.5 Obtener imágenes cargadas (para fp_tipo === 'IMAGEN')
    const imagenesResult = await this.dataSource.query(
      `
      SELECT sa.sa_fp_id, sa.sa_ruta_almacenamiento, sa.sa_tipo_mime
      FROM (
        SELECT sa_fp_id, sa_ruta_almacenamiento, sa_tipo_mime,
          ROW_NUMBER() OVER (PARTITION BY sa_fp_id ORDER BY sa_created_at DESC) AS rn
        FROM Solicitud_archivo
        WHERE sa_sol_id = @0 AND sa_estado = 'activo'
      ) sa
      WHERE sa.rn = 1
      `,
      [solicitudId],
    );
    const imagenesMap = new Map<
      number,
      { sa_ruta_almacenamiento: string; sa_tipo_mime: string }
    >();
    for (const img of imagenesResult) {
      imagenesMap.set(img.sa_fp_id, {
        sa_ruta_almacenamiento: img.sa_ruta_almacenamiento,
        sa_tipo_mime: img.sa_tipo_mime,
      });
    }

    // 6. Crear mapa de respuestas resueltas
    const respuestasMap = new Map<number, string>();
    const tablaFilasMap = new Map<number, Record<string, string>[]>();
    for (const respuesta of respuestas) {
      const valor = await this.resolverValorRespuesta(respuesta);
      respuestasMap.set(respuesta.fr_fp_id, valor);

      if (respuesta.fp_tipo === 'TABLA' && respuesta.fr_valor_texto) {
        try {
          const filas = JSON.parse(respuesta.fr_valor_texto);
          if (Array.isArray(filas) && filas.length > 0) {
            tablaFilasMap.set(respuesta.fr_fp_id, filas);
          }
        } catch {
          // Ignorar JSON inválido; se usará el fallback de texto plano
        }
      }
    }

    // 7. Crear mapa de visibilidad (condicionales)
    const visibilidadMap = new Map<number, boolean>();
    for (const pregunta of preguntas) {
      let esVisible = true;
      if (pregunta.fp_pregunta_padre_id && pregunta.fp_valor_padre_disparador) {
        const respuestaPadre = respuestasMap.get(pregunta.fp_pregunta_padre_id);
        esVisible = respuestaPadre === pregunta.fp_valor_padre_disparador;
      }
      visibilidadMap.set(pregunta.fp_id, esVisible);
    }

    // 8. Construir preguntas renderizables
    const preguntasRenderizables: PreguntaRenderizable[] = preguntas.map(
      (p: any) => ({
        fp_id: p.fp_id,
        fp_tipo: p.fp_tipo,
        fp_descripcion: p.fp_descripcion,
        fp_descripcion_adicional: p.fp_descripcion_adicional,
        seccion_id: p.seccion_id,
        fp_orden: p.fp_orden,
        fp_requerida: p.fp_requerida,
        es_visible: visibilidadMap.get(p.fp_id) ?? true,
        fp_pregunta_padre_id: p.fp_pregunta_padre_id,
        fp_valor_padre_disparador: p.fp_valor_padre_disparador,
        valor_resuelto: respuestasMap.get(p.fp_id) || 'Sin respuesta',
        tiene_respuesta: respuestasMap.has(p.fp_id),
        fp_catalogo_tabla: p.fp_catalogo_tabla,
        fp_catalogo_columna: p.fp_catalogo_columna,
        fp_catalogo_pk_column: p.fp_catalogo_pk_column,
        tabla_columnas:
          p.fp_tipo === 'TABLA'
            ? this.parseTablaColumnas(p.fp_tabla_columnas)
            : undefined,
        tabla_filas:
          p.fp_tipo === 'TABLA' ? tablaFilasMap.get(p.fp_id) : undefined,
        imagen_ruta:
          p.fp_tipo === 'IMAGEN'
            ? (imagenesMap.get(p.fp_id)?.sa_ruta_almacenamiento ?? null)
            : undefined,
        imagen_tipo_mime:
          p.fp_tipo === 'IMAGEN'
            ? (imagenesMap.get(p.fp_id)?.sa_tipo_mime ?? null)
            : undefined,
      }),
    );

    return {
      sol_id: solicitudId,
      sol_numero_solicitud,
      cliente_nombre: cli_razon_social || 'N/A',
      centro_operacion_nombre: cop_nombre || 'N/A',
      formulario_nombre: formularioNombre,
      formulario_version: version,
      preguntas: preguntasRenderizables,
    };
  }

  private parseTablaColumnas(fpTablaColumnas?: string | null): string[] {
    if (!fpTablaColumnas) return [];
    try {
      const parsed = JSON.parse(fpTablaColumnas);
      return Array.isArray(parsed)
        ? parsed.filter((c) => typeof c === 'string')
        : [];
    } catch {
      return [];
    }
  }

  private async resolverValorRespuesta(respuesta: any): Promise<string> {
    // TABLA: fr_valor_texto guarda un JSON con las filas capturadas
    if (respuesta.fp_tipo === 'TABLA' && respuesta.fr_valor_texto) {
      try {
        const filas = JSON.parse(respuesta.fr_valor_texto);
        if (Array.isArray(filas) && filas.length > 0) {
          return filas
            .map((fila: Record<string, string>) =>
              Object.entries(fila)
                .map(([columna, valor]) => `${columna}: ${valor ?? ''}`)
                .join(', '),
            )
            .join(' | ');
        }
        return 'Sin respuesta';
      } catch {
        return respuesta.fr_valor_texto;
      }
    }

    // SELECT_TABLA: puede estar en fr_valor_opcion_id O fr_valor_numero
    if (respuesta.fp_tipo === 'SELECT_TABLA' && respuesta.fp_catalogo_tabla) {
      const idValor = respuesta.fr_valor_opcion_id || respuesta.fr_valor_numero;
      if (idValor !== null && idValor !== undefined) {
        try {
          // Usar comillas seguras alrededor de nombres de tabla/columna
          const sql = `SELECT [${respuesta.fp_catalogo_columna}] FROM [${respuesta.fp_catalogo_tabla}] WHERE [${respuesta.fp_catalogo_pk_column}] = @0`;
          const catalogo = await this.dataSource.query(sql, [idValor]);
          return (
            catalogo?.[0]?.[respuesta.fp_catalogo_columna] || 'Sin respuesta'
          );
        } catch (err) {
          console.error('Error resolviendo SELECT_TABLA:', err);
          return 'Sin respuesta';
        }
      }
    }

    // SELECT: buscar en opciones
    if (respuesta.fr_valor_opcion_id) {
      try {
        const opcion = await this.dataSource.query(
          `SELECT fpo_valor FROM Formulario_pregunta_opcion WHERE fpo_id = @0`,
          [respuesta.fr_valor_opcion_id],
        );
        return opcion?.[0]?.fpo_valor || 'Sin respuesta';
      } catch {
        return 'Sin respuesta';
      }
    }

    // Tipos simples
    if (respuesta.fr_valor_texto) {
      return respuesta.fr_valor_texto;
    }
    if (respuesta.fr_valor_numero !== null) {
      return String(respuesta.fr_valor_numero);
    }
    if (respuesta.fr_valor_fecha) {
      return new Date(respuesta.fr_valor_fecha).toLocaleDateString('es-CO');
    }

    // Archivo
    if (respuesta.fr_valor_archivo_id) {
      try {
        const archivo = await this.dataSource.query(
          `SELECT sa_nombre_original FROM Solicitud_archivo WHERE sa_id = @0`,
          [respuesta.fr_valor_archivo_id],
        );
        return archivo?.[0]?.sa_nombre_original || 'Sin respuesta';
      } catch {
        return 'Sin respuesta';
      }
    }

    return 'Sin respuesta';
  }
}
