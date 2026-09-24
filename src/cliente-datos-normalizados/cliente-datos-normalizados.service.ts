// src/cliente-datos-normalizados/cliente-datos-normalizados.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MaestrosService } from '../maestros/maestros.service';

/**
 * Materializa por cliente (cli_id) las secciones del formulario que son
 * preguntas tipo TABLA — hoy solo existen como JSON de texto en
 * Formulario_respuesta.fr_valor_texto, atado a sol_id. Ver
 * "Documentos Cartonera/documentacion/Problemas serios/problemas.md".
 *
 * Se llama dentro de la misma transacción que promueve Cliente_archivo
 * (guardarConceptoGenerico, solicitudes-workflow.service.ts), solo cuando
 * la solicitud queda APROBADA en CC2 — mismo queryRunner, si algo falla acá
 * se revierte junto con el resto de la aprobación (a propósito: mejor una
 * aprobación que falla explícita que un dato perdido en silencio).
 */

type TipoColumnaFormulario =
  | 'TEXTO'
  | 'NUMERO'
  | 'SI_NO'
  | 'CATALOGO'
  | 'MONEDA';

interface ColumnaTablaDef {
  nombre: string;
  // Identidad estable de la columna entre renombrados de etiqueta — ver
  // "Documentos Cartonera/documentacion/Funcionalidades/
  // codigo-estable-columnas-tabla.md". Ausente en columnas guardadas antes
  // de este cambio y todavía no vueltas a guardar (fallback a `nombre` vía
  // `aliases` en CampoMapeado).
  codigo?: string;
  tipo: TipoColumnaFormulario;
  catalogo_tabla?: string;
  catalogo_columna?: string;
  catalogo_pk_column?: string;
  catalogo_columna_padre?: string;
  catalogo_columna_filtro?: string;
  // Condición estática ("columna = valor") declarada explícitamente desde
  // el editor (opcional) — si falta, MaestrosService cae a adivinar la
  // columna de estado/activo por convención de nombre, igual que antes.
  catalogo_columna_condicion?: string;
  catalogo_valor_condicion?: string;
}

type TipoCampoDestino = 'TEXTO' | 'BIT' | 'DECIMAL' | 'CATALOGO_ID';

interface CampoMapeado {
  // Etiquetas ("nombre" en fp_tabla_columnas / claves en fr_valor_texto)
  // que pueden identificar esta columna a través de distintas versiones
  // del formulario — recopiladas contra la BD real (fp_version 9 a 15).
  // Fallback de transición: solo se usa para columnas que todavía no
  // tengan `codigo` (ver ColumnaTablaDef.codigo). Si una versión futura
  // renombra la columna a algo no listado aquí Y la columna tampoco tiene
  // `codigo` todavía, el campo queda NULL (mismo comportamiento
  // documentado en problemas.md, sección "Riesgo adicional" — ya no
  // debería pasar después del backfill de
  // scripts/backfill-codigos-columnas-tabla.mjs).
  aliases: string[];
  // `columna` (destino) DUPLICA el rol de identidad estable: por
  // convención, el `codigo` que este mapeo espera encontrar en
  // ColumnaTablaDef.codigo es exactamente este mismo string — así el
  // backfill (y la autogeneración en formulario-preguntas.service.ts para
  // columnas nuevas fuera de este mapeo) no necesitan inventar ni
  // consultar nada aparte para columnas ya mapeadas acá.
  columna: string;
  kind: TipoCampoDestino;
}

interface MapeoTabla {
  fpCodigo: string;
  tabla: string;
  fkCliente: string;
  fkSolicitud: string;
  // Para REP_LEGAL_TABLA / REP_LEGAL_SUPLENTES: mismo destino, discriminado
  // por un valor fijo en vez de duplicar la tabla.
  filtroExtra?: { columna: string; valor: string };
  campos: CampoMapeado[];
}

const REP_LEGAL_CAMPOS: CampoMapeado[] = [
  { aliases: ['Apellidos y Nombre'], columna: 'crl_nombre', kind: 'TEXTO' },
  { aliases: ['Identificacion'], columna: 'crl_identificacion', kind: 'TEXTO' },
  {
    aliases: ['Ciudad de Expedición'],
    columna: 'crl_ciu_expedicion_id',
    kind: 'CATALOGO_ID',
  },
  { aliases: ['Direccion'], columna: 'crl_direccion', kind: 'TEXTO' },
];

const MAPEOS: MapeoTabla[] = [
  {
    fpCodigo: 'AUTO_Q1231', // "Direcciones", INFORMACION PARA DESPACHOS
    tabla: 'cliente_direcciones_envio',
    fkCliente: 'cde_cli_id',
    fkSolicitud: 'cde_sol_id',
    campos: [
      { aliases: ['Pais'], columna: 'cde_pai_id', kind: 'CATALOGO_ID' },
      {
        aliases: ['Departamento'],
        columna: 'cde_dpto_id',
        kind: 'CATALOGO_ID',
      },
      { aliases: ['Ciudad'], columna: 'cde_ciu_id', kind: 'CATALOGO_ID' },
      { aliases: ['Direccion'], columna: 'cde_direccion', kind: 'TEXTO' },
      { aliases: ['Zona Franca'], columna: 'cde_zona_franca', kind: 'BIT' },
      { aliases: ['Horario'], columna: 'cde_horario', kind: 'TEXTO' },
    ],
  },
  {
    fpCodigo: 'REP_LEGAL_TABLA', // representante legal principal
    tabla: 'cliente_representantes_legales',
    fkCliente: 'crl_cli_id',
    fkSolicitud: 'crl_sol_id',
    filtroExtra: { columna: 'crl_tipo', valor: 'PRINCIPAL' },
    campos: REP_LEGAL_CAMPOS,
  },
  {
    fpCodigo: 'REP_LEGAL_SUPLENTES',
    tabla: 'cliente_representantes_legales',
    fkCliente: 'crl_cli_id',
    fkSolicitud: 'crl_sol_id',
    filtroExtra: { columna: 'crl_tipo', valor: 'SUPLENTE' },
    campos: REP_LEGAL_CAMPOS,
  },
  {
    // Bug encontrado 2026-09-14 al implementar codigo-estable-columnas-tabla.md:
    // este mapeo decía 'AUTO_Q2659' pero la pregunta real en producción
    // tiene fp_codigo='ACCIONISTAS_TABLA' (fp_id=3007, fp_estado=true) —
    // no hay ninguna fila con fp_codigo='AUTO_Q2659' en la BD. Confirmado
    // en vivo: cliente_accionistas tenía 0 filas pese a existir al menos
    // una solicitud APROBADA con cliente_direcciones_envio ya poblada (que
    // sí matcheaba) — esta sección nunca se guardó desde que existe este
    // servicio, sin ningún error visible (promoverMapeo solo loguea un
    // warning cuando no encuentra la pregunta).
    fpCodigo: 'ACCIONISTAS_TABLA', // relación de accionistas
    tabla: 'cliente_accionistas',
    fkCliente: 'cac_cli_id',
    fkSolicitud: 'cac_sol_id',
    campos: [
      {
        aliases: ['Nombre Completo / Razón Social'],
        columna: 'cac_nombre_razon_social',
        kind: 'TEXTO',
      },
      {
        aliases: ['Tipo de Identificación'],
        columna: 'cac_tid_id',
        kind: 'CATALOGO_ID',
      },
      {
        aliases: ['No. Identificación'],
        columna: 'cac_no_identificacion',
        kind: 'TEXTO',
      },
      {
        // La tilde en "Participáción" está mal puesta en el dato real
        // (fp_tabla_columnas de producción) — se deja tal cual porque es
        // literalmente la clave del JSON guardado, no un typo a corregir.
        aliases: ['% Participáción', '% Participación'],
        columna: 'cac_porcentaje_participacion',
        kind: 'DECIMAL',
      },
    ],
  },
  {
    fpCodigo: 'AUTO_Q2651', // Contactos Compras/Almacén/Calidad/Tesorería/Financiera
    tabla: 'cliente_contactos_area',
    fkCliente: 'cca_cli_id',
    fkSolicitud: 'cca_sol_id',
    campos: [
      { aliases: ['Nombre'], columna: 'cca_nombre', kind: 'TEXTO' },
      { aliases: ['Cargo'], columna: 'cca_cargo', kind: 'TEXTO' },
      { aliases: ['Telefono'], columna: 'cca_telefono', kind: 'TEXTO' },
      { aliases: ['Correo electronico'], columna: 'cca_correo', kind: 'TEXTO' },
    ],
  },
  {
    fpCodigo: 'AUTO_Q2671', // Beneficiarios comercio exterior
    tabla: 'cliente_beneficiarios_comex',
    fkCliente: 'cbc_cli_id',
    fkSolicitud: 'cbc_sol_id',
    campos: [
      { aliases: ['Nombre'], columna: 'cbc_nombre', kind: 'TEXTO' },
      {
        aliases: ['Identificacion'],
        columna: 'cbc_identificacion',
        kind: 'TEXTO',
      },
      { aliases: ['Direccion'], columna: 'cbc_direccion', kind: 'TEXTO' },
    ],
  },
  {
    fpCodigo: 'AUTO_Q2661', // Facturación electrónica
    tabla: 'cliente_contactos_facturacion_electronica',
    fkCliente: 'cfe_cli_id',
    fkSolicitud: 'cfe_sol_id',
    campos: [
      { aliases: ['Nombre'], columna: 'cfe_nombre', kind: 'TEXTO' },
      { aliases: ['Cargo'], columna: 'cfe_cargo', kind: 'TEXTO' },
      { aliases: ['Correo electronico'], columna: 'cfe_correo', kind: 'TEXTO' },
    ],
  },
  {
    fpCodigo: 'AUTO_Q2675', // Referencia Comercial
    tabla: 'cliente_referencias_comerciales',
    fkCliente: 'crc_cli_id',
    fkSolicitud: 'crc_sol_id',
    campos: [
      // v9-13 guardaba "Nombre" + "Persona a contactar" separados; v14+ los
      // fusionó en "Nombre Persona a contactar" y agregó "Correo" — ejemplo
      // real (no hipotético) del riesgo de columnas renombradas entre
      // versiones que ya advertía problemas.md.
      {
        aliases: ['Nombre Persona a contactar', 'Nombre'],
        columna: 'crc_nombre_contacto',
        kind: 'TEXTO',
      },
      { aliases: ['Telefono'], columna: 'crc_telefono', kind: 'TEXTO' },
      { aliases: ['Correo'], columna: 'crc_correo', kind: 'TEXTO' },
      {
        aliases: ['Cupo credito'],
        columna: 'crc_cupo_credito',
        kind: 'DECIMAL',
      },
    ],
  },
  {
    fpCodigo: 'AUTO_Q2676', // Referencia Bancaria
    tabla: 'cliente_referencias_bancarias',
    fkCliente: 'crb_cli_id',
    fkSolicitud: 'crb_sol_id',
    campos: [
      { aliases: ['Nombre'], columna: 'crb_nombre_banco', kind: 'TEXTO' },
      { aliases: ['Sucursal'], columna: 'crb_sucursal', kind: 'TEXTO' },
      { aliases: ['Cuenta No.'], columna: 'crb_cuenta_no', kind: 'TEXTO' },
      { aliases: ['Telefono'], columna: 'crb_telefono', kind: 'TEXTO' },
    ],
  },
];

type TipoCampoPlano = 'TEXTO' | 'ID_DIRECTO' | 'TIPO_IDENTIFICACION';

interface CampoPlanoMapeado {
  fpCodigo: string;
  columnaCliente: string;
  kind: TipoCampoPlano;
}

// Contraparte de valor único (no TABLA) del mismo problema: preguntas de
// "DATOS DE IDENTIFICACIÓN" que ya tienen columna propia en Clientes desde
// siempre (razón social, tipo de documento, país/depto/ciudad, correo),
// pero cuya respuesta tampoco se sincroniza de vuelta a Clientes al
// aprobar — confirmado en problemas.md: "Aprobar una solicitud no
// sincroniza nada de vuelta a Clientes". Se reutiliza fp_precarga_campo_cliente
// (hoy solo usado para precargar el formulario DESDE Clientes, ver
// useClienteData.ts en el frontend) como evidencia de qué pregunta
// corresponde a qué campo, pero el fpCodigo de cada fila de abajo es la
// clave real de búsqueda (estable entre versiones), igual que en MAPEOS.
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
  // País/Departamento/Ciudad son SELECT_TABLA de valor único (no TABLA):
  // a diferencia de las celdas CATALOGO dentro de una TABLA (que guardan
  // el texto visible, ver MAPEOS arriba), estas preguntas guardan
  // directamente el id numérico del catálogo en fr_valor_numero — ver
  // PreguntaRenderer.tsx (frontend), línea ~517-519. Sin ambigüedad de
  // nombres duplicados que resolver acá.
  { fpCodigo: 'AUTO_Q1154', columnaCliente: 'pai_id', kind: 'ID_DIRECTO' },
  { fpCodigo: 'AUTO_Q1155', columnaCliente: 'dpto_id', kind: 'ID_DIRECTO' },
  { fpCodigo: 'AUTO_Q1156', columnaCliente: 'ciu_id', kind: 'ID_DIRECTO' },
];

@Injectable()
export class ClienteDatosNormalizadosService {
  private readonly logger = new Logger(ClienteDatosNormalizadosService.name);

  constructor(private readonly maestrosService: MaestrosService) {}

  /**
   * Punto de entrada: reemplaza (DELETE + INSERT) las filas de cada tabla
   * normalizada para este cliente, leyendo la respuesta de la solicitud
   * que se está aprobando. No hay clave natural estable entre solicitudes
   * para hacer upsert fila a fila, así que cada aprobación deja "la
   * versión vigente" del cliente en estas tablas — el histórico por
   * solicitud puntual lo sigue cubriendo Formulario_respuesta intacto.
   */
  async promoverTablasNormalizadas(
    clienteId: number,
    solicitudId: number,
    queryRunner: any,
  ): Promise<void> {
    const [solicitud] = await queryRunner.query(
      `SELECT sol_formulario_version FROM solicitudes WHERE sol_id = @0`,
      [solicitudId],
    );
    const fpVersion = solicitud?.sol_formulario_version || 1;

    // Deshabilitado a propósito (2026-09-20, decisión del usuario): las 8
    // tablas de MAPEOS (cliente_accionistas, cliente_direcciones_envio,
    // etc.) no existen todavía en producción y su único consumidor
    // planeado (integraciones/uno, para envío a SIESA) sigue siendo un
    // stub sin conexión real — ver "Problemas serios/problemas.md". Como
    // este bucle corre sin try/catch dentro de la misma transacción de la
    // aprobación en CC2, desplegar el código tal cual sin esas tablas
    // hubiera roto TODA aprobación de CC2 en producción. El envío a SIESA
    // va a leer directo del formulario (Formulario_respuesta) en vez de
    // depender de esta materialización — ver sol_sincro_siesa.
    //
    // for (const mapeo of MAPEOS) {
    //   await this.promoverMapeo(queryRunner, clienteId, solicitudId, mapeo, fpVersion);
    // }

    await this.sincronizarCamposPlanos(
      queryRunner,
      clienteId,
      solicitudId,
      fpVersion,
    );
  }

  /**
   * UPDATE Clientes con las respuestas de "DATOS DE IDENTIFICACIÓN" que ya
   * tienen columna propia (razón social, NIT, tipo de documento, país/
   * depto/ciudad, correo) — CAMPOS_PLANOS. A diferencia de las tablas
   * TABLA (que se reemplazan por completo), acá nunca se escribe NULL: si
   * la solicitud no respondió una pregunta, o la respondió vacía, se deja
   * intacto lo que Clientes ya tenía (varias de estas columnas son
   * NOT NULL — sobreescribir con vacío rompería la fila del cliente).
   */
  private async sincronizarCamposPlanos(
    queryRunner: any,
    clienteId: number,
    solicitudId: number,
    fpVersion: number,
  ): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];

    // Pregunta + respuesta de todos los campos en una sola consulta (antes
    // eran dos por campo). Si una pregunta tiene varias respuestas se toma
    // la primera, igual que antes.
    const filas: {
      fp_codigo: string;
      fr_valor_texto: string | null;
      fr_valor_numero: number | null;
      fr_valor_opcion_id: number | null;
    }[] = await queryRunner.query(
      `SELECT fp.fp_codigo, fr.fr_valor_texto, fr.fr_valor_numero, fr.fr_valor_opcion_id
       FROM Formulario_pregunta fp
       JOIN Formulario_respuesta fr ON fr.fr_fp_id = fp.fp_id AND fr.fr_sol_id = @0
       WHERE fp.fp_version = @1
         AND fp.fp_codigo IN (SELECT value FROM OPENJSON(@2))`,
      [
        solicitudId,
        fpVersion,
        JSON.stringify(CAMPOS_PLANOS.map((c) => c.fpCodigo)),
      ],
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
      `[sincronizarCamposPlanos] Cliente ${clienteId}: ${sets.length} campo(s) actualizados desde solicitud ${solicitudId}`,
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

  private async promoverMapeo(
    queryRunner: any,
    clienteId: number,
    solicitudId: number,
    mapeo: MapeoTabla,
    fpVersion: number,
  ): Promise<void> {
    // Resolver el fp_id por (fp_codigo, fp_version) de ESTA solicitud, nunca
    // hardcodeado ni "la versión más reciente" — cada solicitud se lee
    // contra las preguntas de su propia sol_formulario_version.
    const [pregunta] = await queryRunner.query(
      `SELECT fp_id, fp_tabla_columnas FROM Formulario_pregunta
       WHERE fp_codigo = @0 AND fp_version = @1 AND fp_tipo = 'TABLA'`,
      [mapeo.fpCodigo, fpVersion],
    );

    if (!pregunta) {
      this.logger.warn(
        `[promoverTablasNormalizadas] fp_codigo=${mapeo.fpCodigo} no existe en fp_version=${fpVersion} — se omite ${mapeo.tabla} para cliente ${clienteId}`,
      );
      return;
    }

    const [respuesta] = await queryRunner.query(
      `SELECT fr_valor_texto FROM Formulario_respuesta WHERE fr_sol_id = @0 AND fr_fp_id = @1`,
      [solicitudId, pregunta.fp_id],
    );

    // Sin fila en Formulario_respuesta: esta solicitud nunca tocó esta
    // sección — el caso real es Ampliación de Cupo (ampliacion-cupo.service.ts),
    // que crea la solicitud escribiendo solo 3 respuestas puntuales (tipo de
    // solicitud, ¿solicita crédito?, cupo) y también pasa por este mismo
    // guardarConceptoGenerico al llegar a CC2. Si se interpretara "sin fila"
    // como "el cliente ya no tiene direcciones/representantes/etc.", cada
    // aprobación de una ampliación de cupo borraría datos vigentes del
    // cliente sin reemplazarlos por nada. Solo una fila con
    // fr_valor_texto = '[]' (el cliente vació la sección a propósito) debe
    // vaciar la tabla destino.
    if (!respuesta) {
      return;
    }

    let filas: Record<string, string>[] = [];
    if (respuesta.fr_valor_texto) {
      try {
        const parsed = JSON.parse(respuesta.fr_valor_texto);
        if (Array.isArray(parsed)) filas = parsed;
      } catch {
        this.logger.warn(
          `[promoverTablasNormalizadas] JSON inválido en fr_valor_texto (fp_id=${pregunta.fp_id}, sol_id=${solicitudId})`,
        );
      }
    }

    const columnaDefs = this.parseColumnaDefs(pregunta.fp_tabla_columnas);

    const deleteWhere = mapeo.filtroExtra
      ? `${mapeo.fkCliente} = @0 AND ${mapeo.filtroExtra.columna} = @1`
      : `${mapeo.fkCliente} = @0`;
    const deleteParams = mapeo.filtroExtra
      ? [clienteId, mapeo.filtroExtra.valor]
      : [clienteId];
    await queryRunner.query(
      `DELETE FROM ${mapeo.tabla} WHERE ${deleteWhere}`,
      deleteParams,
    );

    for (const fila of filas) {
      const idsPorColumna = new Map<string, number | null>();
      const valores: Record<string, any> = {
        [mapeo.fkCliente]: clienteId,
        [mapeo.fkSolicitud]: solicitudId,
      };
      if (mapeo.filtroExtra) {
        valores[mapeo.filtroExtra.columna] = mapeo.filtroExtra.valor;
      }

      for (const campo of mapeo.campos) {
        // codigo primero (estable entre renombrados de etiqueta — ver
        // codigo-estable-columnas-tabla.md), aliases como fallback de
        // transición para columnas que todavía no se hayan re-guardado
        // desde el backfill. Si `def` se resolvió, `def.nombre` es la
        // etiqueta REAL de esta columna en la versión de esta solicitud
        // (más confiable que la lista estática de aliases para leer el
        // valor de `fila`, que está keyeada por esa misma etiqueta).
        const def = this.resolverDefColumna(columnaDefs, campo);
        const valorCrudo = this.obtenerValorCrudo(
          fila,
          def?.nombre ? [def.nombre, ...campo.aliases] : campo.aliases,
        );

        if (campo.kind === 'CATALOGO_ID') {
          const idPadre = def?.catalogo_columna_padre
            ? (idsPorColumna.get(def.catalogo_columna_padre) ?? null)
            : null;
          const id = await this.resolverCatalogoId(def, valorCrudo, idPadre);
          valores[campo.columna] = id;
          if (def) idsPorColumna.set(def.nombre, id);
        } else if (campo.kind === 'BIT') {
          valores[campo.columna] =
            valorCrudo === undefined ? null : /^s/i.test(valorCrudo) ? 1 : 0;
        } else if (campo.kind === 'DECIMAL') {
          const numero = valorCrudo
            ? Number(valorCrudo.replace(/[^\d.-]/g, ''))
            : NaN;
          valores[campo.columna] = Number.isFinite(numero) ? numero : null;
        } else {
          valores[campo.columna] = valorCrudo ?? null;
        }
      }

      const columnas = Object.keys(valores);
      const placeholders = columnas.map((_, i) => `@${i}`).join(', ');
      await queryRunner.query(
        `INSERT INTO ${mapeo.tabla} (${columnas.join(', ')}) VALUES (${placeholders})`,
        columnas.map((c) => valores[c]),
      );
    }

    this.logger.log(
      `[promoverTablasNormalizadas] Cliente ${clienteId}: ${filas.length} fila(s) → ${mapeo.tabla} (${mapeo.fpCodigo}, fp_version=${fpVersion})`,
    );
  }

  // codigo primero (estable entre renombrados de etiqueta — ver
  // codigo-estable-columnas-tabla.md), aliases como fallback de transición
  // para columnas que todavía no se hayan re-guardado desde el backfill.
  // Compartido entre promoverMapeo (aprobación real) y
  // validarColumnasMapeadas (chequeo al activar una versión).
  private resolverDefColumna(
    columnaDefs: ColumnaTablaDef[],
    campo: CampoMapeado,
  ): ColumnaTablaDef | undefined {
    return (
      columnaDefs.find((d) => d.codigo === campo.columna) ??
      columnaDefs.find((d) => campo.aliases.includes(d.nombre))
    );
  }

  /**
   * Falla explícita en vez de dato perdido en silencio (problemas.md,
   * "Riesgo adicional", recomendación #2): antes de activar una versión de
   * formulario, confirma que todas las preguntas TABLA usadas por SIESA
   * (MAPEOS) siguen presentes en esa versión y no perdieron ninguna de sus
   * columnas mapeadas. Devuelve la lista de problemas encontrados (vacía =
   * todo bien) — quien llama decide si eso bloquea la activación.
   */
  async validarColumnasMapeadas(
    fpVersion: number,
    runner: { query: (sql: string, params?: any[]) => Promise<any> },
  ): Promise<string[]> {
    const problemas: string[] = [];

    for (const mapeo of MAPEOS) {
      const [pregunta] = await runner.query(
        `SELECT fp_id, fp_descripcion, fp_tabla_columnas FROM Formulario_pregunta
         WHERE fp_codigo = @0 AND fp_version = @1 AND fp_tipo = 'TABLA'`,
        [mapeo.fpCodigo, fpVersion],
      );

      if (!pregunta) {
        problemas.push(
          `No existe la pregunta "${mapeo.fpCodigo}" (tipo TABLA) en esta versión — ` +
            `esa sección deja de sincronizarse con ${mapeo.tabla}.`,
        );
        continue;
      }

      const columnaDefs = this.parseColumnaDefs(pregunta.fp_tabla_columnas);

      for (const campo of mapeo.campos) {
        const def = this.resolverDefColumna(columnaDefs, campo);
        if (!def) {
          problemas.push(
            `"${pregunta.fp_descripcion}" (${mapeo.fpCodigo}): falta la columna ` +
              `"${campo.aliases[0]}" (destino ${mapeo.tabla}.${campo.columna}) — ` +
              `ese campo quedará vacío en las próximas aprobaciones.`,
          );
        }
      }
    }

    return problemas;
  }

  private obtenerValorCrudo(
    fila: Record<string, string>,
    aliases: string[],
  ): string | undefined {
    for (const alias of aliases) {
      const valor = fila[alias];
      if (
        valor !== undefined &&
        valor !== null &&
        String(valor).trim() !== ''
      ) {
        return String(valor).trim();
      }
    }
    return undefined;
  }

  private parseColumnaDefs(fpTablaColumnas: string | null): ColumnaTablaDef[] {
    if (!fpTablaColumnas) return [];
    try {
      const parsed = JSON.parse(fpTablaColumnas);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((c: any): ColumnaTablaDef | null => {
          if (typeof c === 'string') return { nombre: c, tipo: 'TEXTO' };
          if (c && typeof c === 'object' && typeof c.nombre === 'string') {
            return {
              nombre: c.nombre,
              tipo: c.tipo ?? 'TEXTO',
              catalogo_tabla: c.catalogo_tabla,
              catalogo_columna: c.catalogo_columna,
              catalogo_pk_column: c.catalogo_pk_column,
              catalogo_columna_padre: c.catalogo_columna_padre,
              catalogo_columna_filtro: c.catalogo_columna_filtro,
              catalogo_columna_condicion: c.catalogo_columna_condicion,
              catalogo_valor_condicion: c.catalogo_valor_condicion,
            };
          }
          return null;
        })
        .filter((c): c is ColumnaTablaDef => c !== null);
    } catch {
      return [];
    }
  }

  /**
   * Resuelve el id de catálogo (ej. ciu_id) a partir del texto guardado en
   * la celda (el formulario guarda la etiqueta visible, no el id — ver
   * TablaField.tsx en el frontend, columnas CATALOGO usan
   * op.op_descripcion como value). Si la columna depende de otra (ej.
   * Ciudad depende de Departamento), filtra por el id ya resuelto del
   * padre en esta misma fila.
   *
   * Reutiliza MaestrosService.getCatalogo en vez de reimplementar la
   * detección de "fila activa": esa es la misma consulta que ya sirve las
   * opciones del dropdown de esta columna en el formulario
   * (detectarColumnaEstado + condición flexible TRY_CONVERT(BIT,...)/
   * 'ACTIVO'/'A'/'SI'/'S'), así que resolver contra ese mismo universo de
   * opciones garantiza que solo se matchee algo que el cliente pudo haber
   * seleccionado realmente — evita reinventar (y potencialmente
   * desalinear) el criterio de "activo" acá. Catálogos con etiqueta
   * duplicada entre una fila activa y una inactiva (confirmado en
   * Ciudads: "Galapa" con ciu_id=10 inactivo y ciu_id=671 activo) quedan
   * resueltos porque getCatalogo ya excluye la inactiva del listado.
   */
  private async resolverCatalogoId(
    def: ColumnaTablaDef | undefined,
    valorTexto: string | undefined,
    idPadre: number | null,
  ): Promise<number | null> {
    if (
      !def ||
      !valorTexto ||
      !def.catalogo_tabla ||
      !def.catalogo_columna ||
      !def.catalogo_pk_column
    ) {
      return null;
    }

    const usaFiltroPadre = !!def.catalogo_columna_filtro && idPadre !== null;
    const opciones = await this.maestrosService.getCatalogo(
      def.catalogo_tabla,
      undefined,
      def.catalogo_columna,
      def.catalogo_pk_column,
      usaFiltroPadre ? def.catalogo_columna_filtro : undefined,
      usaFiltroPadre ? String(idPadre) : undefined,
      def.catalogo_columna_condicion || undefined,
      def.catalogo_valor_condicion || undefined,
    );

    const valorNormalizado = valorTexto.trim().toLowerCase();
    const coincidencia = (
      opciones as { op_id: number; op_descripcion: string }[]
    ).find((op) => op.op_descripcion.trim().toLowerCase() === valorNormalizado);

    return coincidencia?.op_id ?? null;
  }
}
