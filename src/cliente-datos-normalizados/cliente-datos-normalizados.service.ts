// src/cliente-datos-normalizados/cliente-datos-normalizados.service.ts
import { Injectable, Logger } from '@nestjs/common';

/**
 * Al aprobar una solicitud en CC2, copia a `Clientes` las respuestas de
 * "DATOS DE IDENTIFICACIÓN" que ya tienen columna propia ahí (CAMPOS_PLANOS).
 *
 * Las secciones tipo TABLA (direcciones, contactos, representantes,
 * accionistas…) NO se materializan en tablas aparte: se leen directo de
 * Formulario_respuesta cuando hacen falta (ej. vista previa de SIESA en
 * clientes-siesa.service.ts). Las tablas `cliente_*` que existieron para eso
 * se eliminaron el 2026-09-26 — ver "Documentos Cartonera/documentacion/
 * Portal Clientes/SIESA/plan-envio-solicitud-aprobada-a-siesa.md".
 *
 * Se llama dentro de la misma transacción que promueve Cliente_archivo
 * (guardarConceptoGenerico, solicitudes-workflow.service.ts) — mismo
 * queryRunner, si algo falla acá se revierte junto con el resto de la
 * aprobación.
 */

type TipoCampoPlano = 'TEXTO' | 'ID_DIRECTO' | 'TIPO_IDENTIFICACION';

interface CampoPlanoMapeado {
  fpCodigo: string;
  columnaCliente: string;
  kind: TipoCampoPlano;
}

// Preguntas de "DATOS DE IDENTIFICACIÓN" que tienen columna propia en
// Clientes (razón social, tipo de documento, país/depto/ciudad, correo).
// Se reutiliza fp_precarga_campo_cliente (usado para precargar el formulario
// DESDE Clientes, ver useClienteData.ts en el frontend) como evidencia de qué
// pregunta corresponde a qué campo, pero el fpCodigo de cada fila de abajo es
// la clave real de búsqueda (estable entre versiones).
// 'NIT' (fp_id "No. Identificación") queda deliberadamente FUERA de este
// mapeo: la pregunta es tipo NUMERO (solo dígitos), pero
// Clientes.cli_nro_identificacion es nvarchar(30) y hoy tiene guion/DV,
// espacios o formatos extranjeros en la gran mayoría de clientes reales
// (confirmado contra la BD: "901687292-0", "900130529-6", "J-30491169-6",
// "R.U.C E-8-47791 D.V. 09", etc.). Sincronizar este campo reemplazaría
// esos valores por la versión sin DV/formato en cada aprobación —
// degradación silenciosa de un dato ya correcto, no una mejora.
const CAMPOS_PLANOS: CampoPlanoMapeado[] = [
  {
    fpCodigo: 'RAZON_SOCIAL',
    columnaCliente: 'cli_razon_social',
    kind: 'TEXTO',
  },
  {
    fpCodigo: 'AUTO_Q1045', // "Tipo de documento" (SELECT)
    columnaCliente: 'cli_tipo_identificacion',
    kind: 'TIPO_IDENTIFICACION',
  },
  { fpCodigo: 'AUTO_Q1054', columnaCliente: 'cli_correo', kind: 'TEXTO' }, // "E-mail"
  // País/Departamento/Ciudad son SELECT_TABLA de valor único: guardan
  // directamente el id numérico del catálogo en fr_valor_numero — ver
  // PreguntaRenderer.tsx (frontend), línea ~517-519.
  { fpCodigo: 'AUTO_Q1154', columnaCliente: 'pai_id', kind: 'ID_DIRECTO' },
  { fpCodigo: 'AUTO_Q1155', columnaCliente: 'dpto_id', kind: 'ID_DIRECTO' },
  { fpCodigo: 'AUTO_Q1156', columnaCliente: 'ciu_id', kind: 'ID_DIRECTO' },
];

@Injectable()
export class ClienteDatosNormalizadosService {
  private readonly logger = new Logger(ClienteDatosNormalizadosService.name);

  /**
   * UPDATE Clientes con las respuestas de CAMPOS_PLANOS de la solicitud que
   * se está aprobando. Nunca escribe NULL: si la solicitud no respondió una
   * pregunta, o la respondió vacía, se deja intacto lo que Clientes ya tenía
   * (varias de estas columnas son NOT NULL — sobreescribir con vacío rompería
   * la fila del cliente). Una ampliación de cupo (que solo escribe 3
   * respuestas) por eso no toca nada.
   */
  async sincronizarClienteDesdeSolicitud(
    clienteId: number,
    solicitudId: number,
    queryRunner: any,
  ): Promise<void> {
    const [solicitud] = await queryRunner.query(
      `SELECT sol_fv_id FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );
    const fvId = solicitud?.sol_fv_id;

    const sets: string[] = [];
    const params: any[] = [];

    // Pregunta + respuesta de todos los campos en una sola consulta. Si una
    // pregunta tiene varias respuestas se toma la primera.
    const filas: {
      fp_codigo: string;
      fr_valor_texto: string | null;
      fr_valor_numero: number | null;
      fr_valor_opcion_id: number | null;
    }[] = await queryRunner.query(
      `SELECT fp.fp_codigo, fr.fr_valor_texto, fr.fr_valor_numero, fr.fr_valor_opcion_id
       FROM Formulario_pregunta fp
       JOIN Formulario_respuesta fr ON fr.fr_fp_id = fp.fp_id AND fr.fr_sol_id = @0
       WHERE fp.fp_fv_id = @1
         AND fp.fp_codigo IN (SELECT value FROM OPENJSON(@2))`,
      [solicitudId, fvId, JSON.stringify(CAMPOS_PLANOS.map((c) => c.fpCodigo))],
    );
    const respuestaPorCodigo = new Map<string, (typeof filas)[number]>();
    for (const f of filas) {
      if (!respuestaPorCodigo.has(f.fp_codigo))
        respuestaPorCodigo.set(f.fp_codigo, f);
    }

    for (const campo of CAMPOS_PLANOS) {
      const respuesta = respuestaPorCodigo.get(campo.fpCodigo);
      if (!respuesta) continue; // esta solicitud nunca respondió esta pregunta

      const valor = await this.resolverValorCampoPlano(
        queryRunner,
        campo,
        respuesta,
      );
      if (valor === null || valor === '') continue;

      sets.push(`${campo.columnaCliente} = @${params.length}`);
      params.push(valor);
    }

    if (sets.length === 0) return;

    params.push(clienteId);
    await queryRunner.query(
      `UPDATE Clientes SET ${sets.join(', ')} WHERE cli_id = @${params.length - 1}`,
      params,
    );

    this.logger.log(
      `[sincronizarClienteDesdeSolicitud] Cliente ${clienteId}: ${sets.length} campo(s) actualizados desde solicitud ${solicitudId}`,
    );
  }

  private async resolverValorCampoPlano(
    queryRunner: any,
    campo: CampoPlanoMapeado,
    respuesta: {
      fr_valor_texto: string | null;
      fr_valor_numero: number | null;
      fr_valor_opcion_id: number | null;
    },
  ): Promise<string | number | null> {
    if (campo.kind === 'TEXTO') {
      const texto = respuesta.fr_valor_texto?.trim();
      if (texto) return texto;
      return respuesta.fr_valor_numero != null
        ? String(respuesta.fr_valor_numero)
        : null;
    }

    if (campo.kind === 'ID_DIRECTO') {
      if (respuesta.fr_valor_numero != null)
        return Number(respuesta.fr_valor_numero);
      if (respuesta.fr_valor_opcion_id != null)
        return Number(respuesta.fr_valor_opcion_id);
      return null;
    }

    // TIPO_IDENTIFICACION: la respuesta es un SELECT (fr_valor_opcion_id →
    // Formulario_pregunta_opcion.fpo_valor, ej. "NIT"/"CC"/"Pasaporte") —
    // hay que resolverlo contra tipos_identificacion por código o nombre
    // (fpo_valor mezcla ambos: "NIT"/"CC" coinciden con tid_codigo,
    // "Pasaporte"/"Cédula de extranjería" con tid_nombre, confirmado en
    // datos reales).
    if (respuesta.fr_valor_opcion_id == null) return null;
    const [opcion] = await queryRunner.query(
      `SELECT fpo_valor FROM Formulario_pregunta_opcion WHERE fpo_id = @0`,
      [respuesta.fr_valor_opcion_id],
    );
    if (!opcion?.fpo_valor) return null;

    const [tipo] = await queryRunner.query(
      `SELECT TOP 1 tid_id FROM tipos_identificacion WHERE UPPER(tid_codigo) = UPPER(@0) OR UPPER(tid_nombre) = UPPER(@0)`,
      [opcion.fpo_valor],
    );
    return tipo?.tid_id ?? null;
  }
}
