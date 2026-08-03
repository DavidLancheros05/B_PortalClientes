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
  // Código lógico estable de la pregunta (sobrevive renames y versiones
  // nuevas del formulario) — ancla de los placeholders {{pregunta|cod:...}}
  // de las plantillas de documentos.
  fp_codigo?: string | null;

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

  // Documento cargado (para fp_tipo === 'ARCHIVO' o 'DOCUMENTOS_TABLA') —
  // el archivo real vive en Solicitud_archivo, no en Formulario_respuesta.
  // null cuando no se ha subido nada todavía.
  documento_cargado?: {
    nombre_archivo: string;
    fecha_emision: string | null;
  } | null;

  // Número de líneas del espacio en blanco (para fp_tipo === 'ESPACIO_FIRMA')
  espacio_lineas?: number;
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
    // 1. Obtener información de la solicitud (incluye versión del formulario
    // en la misma query — antes era un round-trip aparte a la misma tabla).
    // En paralelo, lanzar ya las queries de respuestas/archivos: solo
    // dependen de solicitudId, no de la versión/formularioId resuelta más
    // abajo, así que no hay razón para esperarlas en serie.
    const [solicitud, respuestas, archivosResult] = await Promise.all([
      this.dataSource.query(
        `SELECT
        sol_id, sol_numero_solicitud, cli_razon_social, cop_nombre, sol_fecha_envio,
        sol_formulario_version
      FROM solicitudes s
      LEFT JOIN Clientes c ON c.cli_id = s.sol_cliente_id
      LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
      WHERE s.sol_id = @0`,
        [solicitudId],
      ),
      // 5. Obtener respuestas
      this.dataSource.query(
        `SELECT
        fr.fr_fp_id,
        fr.fr_valor_texto,
        fr.fr_valor_numero,
        fr.fr_valor_fecha,
        fr.fr_valor_opcion_id,
        fr.fr_valor_archivo_id,
        fp.fp_tipo,
        fp.fp_subtipo,
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
      ),
      // 5.5 Obtener archivos cargados por pregunta — cubre tanto fp_tipo ===
      // 'IMAGEN' (imagenesMap) como 'ARCHIVO'/'DOCUMENTOS_TABLA'
      // (archivosDocMap): en ambos casos el archivo real vive en
      // Solicitud_archivo, nunca en Formulario_respuesta.
      this.dataSource.query(
        `
      SELECT sa.sa_fp_id, sa.sa_ruta_almacenamiento, sa.sa_tipo_mime,
        sa.sa_nombre_original, sa.sa_fecha_emision
      FROM (
        SELECT sa_fp_id, sa_ruta_almacenamiento, sa_tipo_mime,
          sa_nombre_original, sa_fecha_emision,
          ROW_NUMBER() OVER (PARTITION BY sa_fp_id ORDER BY sa_created_at DESC) AS rn
        FROM Solicitud_archivo
        WHERE sa_sol_id = @0 AND sa_estado = 'activo'
      ) sa
      WHERE sa.rn = 1
      `,
        [solicitudId],
      ),
    ]);

    if (!solicitud || solicitud.length === 0) {
      throw new Error('Solicitud no encontrada');
    }

    const {
      sol_numero_solicitud,
      cli_razon_social,
      cop_nombre,
      sol_fecha_envio,
      sol_formulario_version,
    } = solicitud[0];
    const version = sol_formulario_version || 1;

    // 3. Obtener formulario ID
    const formResult = await this.dataSource.query(
      `SELECT fv_frm_id FROM Formulario_versiones
       WHERE fv_numero = @0 AND fv_frm_id IN (
         SELECT frm_id FROM formularios WHERE frm_activo = 1
       )`,
      [version],
    );
    const formularioId = formResult[0]?.fv_frm_id;

    // 4. Nombre del formulario y preguntas (ambas solo dependen de
    // formularioId/version, ya resueltos arriba — en paralelo).
    let formularioNombre = 'Formulario';
    let preguntas: any[] = [];
    if (formularioId) {
      const [formNameResult, preguntasResult] = await Promise.all([
        this.dataSource.query(
          `SELECT frm_nombre FROM formularios WHERE frm_id = @0`,
          [formularioId],
        ),
        this.dataSource.query(
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
            fp.fp_tabla_columnas,
            fp.fp_maximo,
            fp.fp_codigo
          FROM Formulario_pregunta fp
          WHERE fp.formulario_id = @0
            AND fp.fp_estado = 1
            AND fp.fp_version = @1
          ORDER BY fp.seccion_id, fp.fp_orden`,
          [formularioId, version],
        ),
      ]);
      // Limpiar: tomar solo la primera línea y remover espacios extras
      const rawNombre = formNameResult[0]?.frm_nombre || 'Formulario';
      formularioNombre = rawNombre.split('\n')[0].trim();
      preguntas = preguntasResult;
    }
    const imagenesMap = new Map<
      number,
      { sa_ruta_almacenamiento: string; sa_tipo_mime: string }
    >();
    const archivosDocMap = new Map<
      number,
      { nombre_archivo: string; fecha_emision: string | null }
    >();
    for (const arch of archivosResult) {
      imagenesMap.set(arch.sa_fp_id, {
        sa_ruta_almacenamiento: arch.sa_ruta_almacenamiento,
        sa_tipo_mime: arch.sa_tipo_mime,
      });
      archivosDocMap.set(arch.sa_fp_id, {
        nombre_archivo: arch.sa_nombre_original,
        fecha_emision: arch.sa_fecha_emision
          ? new Date(arch.sa_fecha_emision).toLocaleDateString('es-CO')
          : null,
      });
    }

    // 6. Crear mapa de respuestas resueltas
    // Resueltas en paralelo (no una por una): SELECT/SELECT_TABLA/archivo
    // disparan una query adicional por respuesta en resolverValorRespuesta,
    // y con el round-trip a la BD remota (SQL8020.site4now.net) resolverlas
    // en serie era la principal causa de la demora al abrir esta página.
    const respuestasMap = new Map<number, string>();
    const tablaFilasMap = new Map<number, Record<string, string>[]>();
    const valoresResueltos = await Promise.all(
      respuestas.map((respuesta) => this.resolverValorRespuesta(respuesta)),
    );
    respuestas.forEach((respuesta, i) => {
      respuestasMap.set(respuesta.fr_fp_id, valoresResueltos[i]);

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
    });

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

    // 7.5 Preguntas "de sistema": no se diligencian, se calculan al generar
    // el PDF. Identificadas por fp_codigo (mismo mecanismo que TIPO_SOLICITUD
    // en el frontend) en vez de por fp_id, para que sobrevivan a nuevas
    // versiones del formulario.
    const fechaEnvioTexto = sol_fecha_envio
      ? new Date(sol_fecha_envio).toLocaleDateString('es-CO')
      : null;

    // 8. Construir preguntas renderizables
    const preguntasRenderizables: PreguntaRenderizable[] = preguntas.map(
      (p: any) => {
        // ARCHIVO/DOCUMENTOS_TABLA: el archivo real vive en Solicitud_archivo,
        // no en Formulario_respuesta — respuestasMap.get(p.fp_id) para estos
        // tipos puede traer un fr_valor_opcion_id "placeholder" heredado (una
        // Formulario_pregunta_opcion cuyo fpo_valor es igual a la propia
        // fp_descripcion), que hacía que el PDF mostrara la pregunta
        // repetida en vez de si el documento fue cargado o no.
        const esTipoDocumento =
          p.fp_tipo === 'ARCHIVO' || p.fp_tipo === 'DOCUMENTOS_TABLA';
        const documentoCargado = esTipoDocumento
          ? (archivosDocMap.get(p.fp_id) ?? null)
          : null;

        return {
          fp_id: p.fp_id,
          fp_tipo: p.fp_tipo,
          fp_descripcion: p.fp_descripcion,
          fp_descripcion_adicional: p.fp_descripcion_adicional,
          fp_codigo: p.fp_codigo,
          seccion_id: p.seccion_id,
          fp_orden: p.fp_orden,
          fp_requerida: p.fp_requerida,
          es_visible: visibilidadMap.get(p.fp_id) ?? true,
          fp_pregunta_padre_id: p.fp_pregunta_padre_id,
          fp_valor_padre_disparador: p.fp_valor_padre_disparador,
          valor_resuelto:
            p.fp_codigo === 'FECHA_ENVIO'
              ? fechaEnvioTexto || 'Sin respuesta'
              : esTipoDocumento
                ? documentoCargado
                  ? `Cargado: ${documentoCargado.nombre_archivo}${
                      documentoCargado.fecha_emision
                        ? ` (Emitido: ${documentoCargado.fecha_emision})`
                        : ''
                    }`
                  : 'Sin respuesta'
                : respuestasMap.get(p.fp_id) || 'Sin respuesta',
          tiene_respuesta:
            p.fp_codigo === 'FECHA_ENVIO'
              ? Boolean(fechaEnvioTexto)
              : esTipoDocumento
                ? Boolean(documentoCargado)
                : respuestasMap.has(p.fp_id),
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
          documento_cargado: documentoCargado,
          espacio_lineas:
            p.fp_tipo === 'ESPACIO_FIRMA' ? p.fp_maximo || 5 : undefined,
        };
      },
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

  // Resuelve solo un puñado de preguntas por fp_codigo — a diferencia de
  // obtenerFormularioRenderizable, que resuelve las ~85-100 preguntas del
  // formulario completo. Pensado para consumidores que solo necesitan 3-4
  // respuestas puntuales (ej. el bloque "Solicita cupo de crédito" de las
  // pantallas de gestión), donde esperar el render completo del formulario
  // era la causa real de la demora. Reutiliza resolverValorRespuesta (misma
  // lógica que ya usa el render completo) en vez de reimplementar el
  // formateo — importante porque algunas preguntas tipo SELECT_TABLA (ej.
  // FORMA_PAGO_SOLICITADA) resuelven su texto contra una tabla catálogo
  // aparte, no contra Formulario_pregunta_opcion.
  async obtenerRespuestasPorCodigo(
    solicitudId: number,
    codigos: string[],
  ): Promise<
    Array<{ fp_codigo: string; valor_resuelto: string; tiene_respuesta: boolean }>
  > {
    if (codigos.length === 0) return [];

    const placeholders = codigos.map((_, i) => `@${i + 1}`).join(', ');
    const filas = await this.dataSource.query(
      `SELECT fp.fp_codigo, fp.fp_tipo, fp.fp_subtipo, fp.fp_catalogo_tabla,
              fp.fp_catalogo_columna, fp.fp_catalogo_pk_column,
              fr.fr_valor_texto, fr.fr_valor_numero, fr.fr_valor_opcion_id,
              fr.fr_valor_archivo_id
       FROM (
         SELECT fr_fp_id, fr_valor_texto, fr_valor_numero, fr_valor_opcion_id,
           fr_valor_archivo_id,
           ROW_NUMBER() OVER (PARTITION BY fr_fp_id ORDER BY fr_updated_at DESC) AS rn
         FROM Formulario_respuesta
         WHERE fr_solicitud_id = @0
       ) fr
       JOIN Formulario_pregunta fp ON fp.fp_id = fr.fr_fp_id
       WHERE fr.rn = 1 AND fp.fp_codigo IN (${placeholders})`,
      [solicitudId, ...codigos],
    );

    const valoresResueltos = await Promise.all(
      filas.map((fila: any) => this.resolverValorRespuesta(fila)),
    );

    return codigos.map((codigo) => {
      const index = filas.findIndex((f: any) => f.fp_codigo === codigo);
      if (index === -1) {
        return { fp_codigo: codigo, valor_resuelto: 'Sin respuesta', tiene_respuesta: false };
      }
      const valor = valoresResueltos[index];
      return {
        fp_codigo: codigo,
        valor_resuelto: valor,
        tiene_respuesta: valor !== 'Sin respuesta',
      };
    });
  }

  private parseTablaColumnas(fpTablaColumnas?: string | null): string[] {
    if (!fpTablaColumnas) return [];
    try {
      const parsed = JSON.parse(fpTablaColumnas);
      if (!Array.isArray(parsed)) return [];
      // Columnas antiguas: array de strings. Columnas con tipo (CATALOGO,
      // SI_NO, etc., ver TablaField.tsx en el frontend): array de objetos
      // { nombre, tipo, ... }.
      return parsed
        .map((c) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object' && typeof c.nombre === 'string') {
            return c.nombre;
          }
          return null;
        })
        .filter((c): c is string => c !== null);
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
      // Mismo formato que el formulario en vivo para preguntas NUMERO con
      // fp_subtipo='MONEDA' (ver PreguntaRenderer.tsx en el frontend):
      // símbolo "$" + separador de miles es-CO. Sin esto, el PDF mostraba
      // el número crudo sin formato (ej. "4342323" en vez de "$4.342.323").
      if (respuesta.fp_subtipo === 'MONEDA') {
        return `$${Number(respuesta.fr_valor_numero).toLocaleString('es-CO')}`;
      }
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
