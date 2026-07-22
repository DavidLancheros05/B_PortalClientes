import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { RemisionClienteResponseDto } from './dto/remision-cliente.response.dto';

@Injectable()
export class RemisionesService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  async getRemisionesPorCliente(
    cliId: number,
  ): Promise<RemisionClienteResponseDto[]> {
    const cliente = await this.clienteRepo.findOne({ where: { cli_id: cliId } });
    const nit = cliente?.cli_nro_identificacion;

    // ────────────────────────────────────────────────────────────────────
    // Pendiente: acceso real a SIESA (ver
    // documentacion/plan-migracion-clientes-siesa.md), igual que en
    // pedidos.service.ts. Consulta va contra la BD de SIESA, no contra la
    // BD del portal — necesita su propia conexión (`mssql`/DataSource
    // aparte), distinta de `this.clienteRepo` de arriba. Cuando exista esa
    // conexión, descomentar este bloque, reemplazar `siesaDataSource` por
    // la instancia real, y borrar el bloque de datos quemados de abajo.
    //
    // Origen: "2. Consulta de remisiones y devoluciones.sql" (aportada por
    // el usuario el 2026-07-21). Se le agregó el filtro
    // `t200_fact.f200_nit = @p_nit` (y el parámetro @p_nit) para acotarla
    // a un solo cliente, igual que se hizo con la consulta de pedidos —
    // la consulta original no filtraba por cliente.
    // ────────────────────────────────────────────────────────────────────
    /*
    const rows = await siesaDataSource.query(
      `
      DECLARE @p_cia              SMALLINT  = 2
      DECLARE @p_tipo_inv         CHAR(10)  = '3'
      DECLARE @p_permiso_costos   SMALLINT  = 1
      DECLARE @p_ind_cliente      SMALLINT  = 0   -- 0 = cliente factura
      DECLARE @p_nit              VARCHAR(20) = @0

      DECLARE @p_fec_inicial  DATETIME  = DATEADD(YEAR, -5, CAST(GETDATE() AS DATE))
      DECLARE @p_fec_final    DATETIME  = CAST(GETDATE() AS DATE)

      ;WITH v470_ventas AS (
          SELECT
              f470_rowid_docto                                                        AS v470_rowid_docto,
              f470_rowid_docto_fact                                                   AS v470_rowid_docto_fact,
              f470_rowid                                                              AS v470_rowid,
              f470_id_cia                                                             AS v470_id_cia,
              f470_rowid_item_ext                                                     AS v470_rowid_item_ext,
              f470_rowid_bodega                                                       AS v470_rowid_bodega,
              f470_id_ubicacion_aux                                                   AS v470_id_ubicacion_aux,
              f470_id_lote                                                            AS v470_id_lote,
              f470_id_instalacion                                                     AS v470_id_instalacion,
              f470_id_fecha                                                           AS v470_id_fecha,
              f470_id_periodo                                                         AS v470_id_periodo,
              f470_ind_estado_cm                                                      AS v470_ind_estado_cm,
              f470_id_concepto                                                        AS v470_id_concepto,
              f470_id_motivo                                                          AS v470_id_motivo,
              f470_id_co_movto                                                        AS v470_id_co_movto,
              f470_id_un_movto                                                        AS v470_id_un_movto,
              f470_rowid_ccosto_movto                                                 AS v470_rowid_ccosto_movto,
              f470_id_proyecto                                                        AS v470_id_proyecto,
              f470_ind_naturaleza                                                     AS v470_ind_naturaleza,
              f470_rowid_pv_movto                                                     AS v470_rowid_pv_movto,
              f470_ind_obsequio                                                       AS v470_ind_obsequio,
              f470_ind_solo_valor                                                     AS v470_ind_solo_valor,
              f470_id_lista_precio                                                    AS v470_id_lista_precio,
              f470_id_unidad_precio                                                   AS v470_id_unidad_precio,
              f470_id_unidad_medida                                                   AS v470_id_unidad_medida,
              f470_factor                                                             AS v470_factor,
              f470_precio_uni                                                         AS v470_precio_uni,
              f470_precio_uni_impto_asumido                                          AS v470_precio_uni_impto_asumido,
              f470_desc_variable                                                      AS v470_desc_variable,
              f470_notas                                                              AS v470_notas,
              f470_vlr_bruto_alt      * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_bruto_alt,
              f470_vlr_dscto_linea_alt * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END) AS v470_vlr_dscto_linea_alt,
              (f470_vlr_bruto_alt - f470_vlr_dscto_linea_alt - f470_vlr_dscto_global_alt)
                  * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)            AS v470_vlr_subtotal_alt,
              f470_vlr_imp_alt        * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_imp_alt,
              f470_vlr_neto_alt       * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_neto_alt,
              f470_vlr_bruto          * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_bruto,
              f470_vlr_dscto_linea    * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_dscto_linea,
              (f470_vlr_bruto - f470_vlr_dscto_linea - f470_vlr_dscto_global)
                  * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)            AS v470_vlr_subtotal,
              f470_vlr_imp            * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_imp,
              f470_vlr_neto           * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_vlr_neto,
              f470_cant_1             * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_cant_1,
              f470_cant_2             * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_cant_2,
              f470_cant_base          * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_cant_base,
              f470_costo_prom_tot     * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)  AS v470_costo_prom_tot,
              f470_id_causal_devol                                                    AS v470_id_causal_devol,
              f470_rowid_tercero_vend                                                 AS v470_rowid_tercero_vend,
              f470_rowid_movto_entidad                                                AS v470_rowid_movto_entidad,
              (CASE ISNULL(f100_ind_calculo_margen_vta, 0)
                   WHEN 0 THEN (f470_vlr_bruto - f470_vlr_dscto_linea - f470_vlr_dscto_global) + f470_vlr_imp_margen
                   ELSE        f470_costo_prom_tot
               END)
              * (CASE f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)                 AS v470_divisor_margen
      FROM  t470_cm_movto_invent WITH (INDEX(IX_T470_3))
      LEFT  JOIN t100_pp_comerciales ON f100_id_cia = f470_id_cia
      )

      SELECT
          t200_desp.f200_razon_social                                                 AS f_cliente_desp_razon_soc,
          v470_id_lote                                                                AS f_lote,
          ISNULL(t430_ped.f430_id_tipo_docto + '-'
                 + dbo.lpad(t430_ped.f430_consec_docto, 8, '0'), ' ')                AS f_pedido_docto,
          RTRIM(t350_rem.f350_id_tipo_docto) + '-'
              + dbo.lpad(t350_rem.f350_consec_docto, 8, '0')                         AS f_nrodocto,
          ISNULL(t350_fact.f350_id_tipo_docto + '-'
                 + dbo.lpad(t350_fact.f350_consec_docto, 8, '0'), ' ')               AS f_factura_docto,
          v470_id_fecha                                                               AS f_fecha,
          f120_id                                                                     AS f_item,
          t460.f460_num_docto_referencia                                             AS f_orden_compra,
          f120_descripcion                                                            AS f_desc_item,
          v470_cant_base                                                              AS f_cant_base,
          CASE WHEN t350_rem.f350_id_clase_docto IN (514, 519)
               THEN v470_precio_uni_impto_asumido
               ELSE v470_precio_uni
          END                                                                         AS f_precio_unit_docto,
          f120_referencia                                                             AS f_referencia,
          f462_id_vehiculo                                                            AS f_vehiculo,
          f462_nombre_conductor                                                       AS f_nombre_conductor,
          v470_cant_base * t122_um.f122_peso                                         AS f_peso,
          CASE v470_ind_estado_cm
              WHEN 0 THEN 'En elaboracion'
              WHEN 1 THEN 'Aprobada'
              WHEN 2 THEN 'Anulada'
              WHEN 3 THEN 'Contabilizada y no facturada'
              WHEN 4 THEN 'No contabilizada y facturada'
              WHEN 5 THEN 'Contabilizada y facturada'
          END                                                                         AS f_estado,
          f462_identif_conductor                                                      AS f_identif_conductor,
          t200_vend.f200_id                                                           AS f_vendedor,
          f215_descripcion                                                            AS f_desc_punto_envio,
          CASE WHEN t460.f460_id_moneda_docto = f010_id_moneda_local
               THEN v470_vlr_bruto
               ELSE v470_vlr_bruto_alt
          END                                                                         AS f_valor_bruto_docto,
          f150_id                                                                     AS f_bodega,
          CASE WHEN t460.f460_id_moneda_docto = f010_id_moneda_local
               THEN v470_vlr_imp
               ELSE v470_vlr_imp_alt
          END                                                                         AS f_valor_imp_docto,
          CASE WHEN t460.f460_id_moneda_docto = f010_id_moneda_local
               THEN v470_vlr_neto
               ELSE v470_vlr_neto_alt
          END                                                                         AS f_valor_neto_docto,
          ISNULL(f419_id_ciudad, t015_envio.f015_id_ciudad)                         AS f_ciudad,
          RTRIM(t013_envio.f013_id) + '-' + t013_envio.f013_descripcion             AS f_ciudad_envio,
          v470_cant_base * t122_um.f122_volumen                                      AS f_vol,
          t01_003.v125_descripcion                                                   AS f_01_003,
          REPLACE(t460.f460_notas, CHAR(13) + CHAR(10), ' ')                        AS f_notas,
          REPLACE(v470_notas, CHAR(13) + CHAR(10), ' ')                             AS f_notas_movto,
          t200_vend.f200_razon_social                                                AS f_vendedor_razon_social,
          f215_id                                                                    AS f_punto_envio,
          CASE WHEN t122_um.f122_peso > 1
               THEN (CASE WHEN t350_rem.f350_id_clase_docto IN (514, 519)
                          THEN v470_precio_uni_impto_asumido
                          ELSE v470_precio_uni END)
                    / t122_um.f122_peso
               ELSE (CASE WHEN t350_rem.f350_id_clase_docto IN (514, 519)
                          THEN v470_precio_uni_impto_asumido
                          ELSE v470_precio_uni END)
                    * t122_um.f122_peso
          END                                                                        AS f_precio_peso,
          ISNULL(t02_CDV.v207_descripcion, ' ')                                      AS f_02_CDV,
          v470_divisor_margen                                                        AS f_divisor_margen_prom,
          v470_rowid                                                                 AS f_rowid_movto,
          t460.f460_id_clase_docto                                                   AS f_id_clase_docto,
          t460.f460_rowid_docto                                                      AS f_rowid,
          t350_rem.f350_consec_docto                                                 AS f_numero,
          CASE WHEN tp.f_rowid_movto IS NULL THEN 0 ELSE 1 END                      AS f_destare_ocul

      FROM  v470_ventas

      INNER JOIN t460_cm_docto_remision_venta  t460
              ON  t460.f460_rowid_docto          = v470_rowid_docto
      INNER JOIN t350_co_docto_contable        t350_rem
              ON  t350_rem.f350_rowid            = v470_rowid_docto
      INNER JOIN t150_mc_bodegas               t150
              ON  t150.f150_rowid                = v470_rowid_bodega
      INNER JOIN t121_mc_items_extensiones
              ON  f121_rowid                     = v470_rowid_item_ext
      INNER JOIN t120_mc_items
              ON  f120_rowid                     = f121_rowid_item
      INNER JOIN t010_mm_companias
              ON  f010_id                        = v470_id_cia
      INNER JOIN t122_mc_items_unidades        t122_um
              ON  t122_um.f122_id_cia            = v470_id_cia
              AND t122_um.f122_id_unidad         = v470_id_unidad_medida
              AND t122_um.f122_rowid_item        = f121_rowid_item
      LEFT  JOIN t122_mc_items_unidades        t122_e
              ON  t122_e.f122_id_cia             = f120_id_cia
              AND t122_e.f122_id_unidad          = f120_id_unidad_empaque
              AND t122_e.f122_rowid_item         = f120_rowid
      INNER JOIN t285_co_centro_op             t285_docto
              ON  t285_docto.f285_id_cia         = t350_rem.f350_id_cia
              AND t285_docto.f285_id             = t350_rem.f350_id_co
      INNER JOIN t200_mm_terceros              t200_fact
              ON  t200_fact.f200_rowid           = t460.f460_rowid_tercero_fact
      INNER JOIN t201_mm_clientes              t201_fact
              ON  t201_fact.f201_rowid_tercero   = t460.f460_rowid_tercero_fact
              AND t201_fact.f201_id_sucursal     = t460.f460_id_sucursal_fact
      INNER JOIN t200_mm_terceros              t200_desp
              ON  t200_desp.f200_rowid           = t460.f460_rowid_tercero_rem
      INNER JOIN t201_mm_clientes              t201_desp
              ON  t201_desp.f201_rowid_tercero   = t460.f460_rowid_tercero_rem
              AND t201_desp.f201_id_sucursal     = t460.f460_id_sucursal_rem
      INNER JOIN t200_mm_terceros              t200_vend
              ON  t200_vend.f200_rowid           = t460.f460_rowid_tercero_vendedor
      LEFT  JOIN t350_co_docto_contable        t350_fact
              ON  t350_fact.f350_rowid           = t460.f460_rowid_docto_factura
      LEFT  JOIN t430_cm_pv_docto              t430_ped
              ON  t430_ped.f430_rowid            = t460.f460_rowid_pv_docto
      LEFT  JOIN t462_cm_docto_transportador   t462
              ON  f462_rowid_docto               = t460.f460_rowid_docto
      LEFT  JOIN t215_mm_puntos_envio_cliente  t215
              ON  f215_rowid                     = t460.f460_rowid_punto_envio_rem
      LEFT  JOIN t015_mm_contactos             t015_envio
              ON  t015_envio.f015_rowid          = f215_rowid_contacto
      LEFT  JOIN t419_mc_contactos_docto       t419
              ON  f419_rowid                     = t460.f460_rowid_contacto_docto_rem
      LEFT  JOIN t013_mm_ciudades              t013_doc
              ON  t013_doc.f013_id_pais          = ISNULL(f419_id_pais,   t015_envio.f015_id_pais)
              AND t013_doc.f013_id_depto         = ISNULL(f419_id_depto,  t015_envio.f015_id_depto)
              AND t013_doc.f013_id               = ISNULL(f419_id_ciudad, t015_envio.f015_id_ciudad)
      LEFT  JOIN t013_mm_ciudades              t013_envio
              ON  t013_envio.f013_id_pais        = t015_envio.f015_id_pais
              AND t013_envio.f013_id_depto       = t015_envio.f015_id_depto
              AND t013_envio.f013_id             = t015_envio.f015_id_ciudad
      LEFT  JOIN (
          SELECT f485_rowid_movto AS f_rowid_movto
          FROM   t485_cm_movto_destare
          GROUP  BY f485_rowid_movto
      )                                        tp
              ON  tp.f_rowid_movto               = v470_rowid
      LEFT  JOIN v125                          t01_003
              ON  t01_003.v125_rowid_item       = f121_rowid_item
              AND t01_003.v125_id_plan          = '003'
      LEFT  JOIN v207                          t02_CDV
              ON  t02_CDV.v207_rowid_tercero    = t460.f460_rowid_tercero_fact
              AND t02_CDV.v207_id_sucursal      = t460.f460_id_sucursal_fact
              AND t02_CDV.v207_id_plan_criterios = 'CDV'

      WHERE  t350_rem.f350_id_clase_docto IN (
                 511, 512, 515, 516, 513, 517, 518, 514,
                 527, 528, 530, 532, 535, 540, 541, 519,
                 1261, 1271
             )
        AND  t350_rem.f350_id_cia          = @p_cia
        AND  t350_rem.f350_fecha    BETWEEN @p_fec_inicial AND @p_fec_final
        AND  f120_id_tipo_inv_serv         = @p_tipo_inv        -- '3'
        AND  t200_fact.f200_nit            = @p_nit

      ORDER BY
          t350_rem.f350_fecha,
          f_nrodocto,
          f120_id
      `,
      [nit],
    );

    return rows.map((r: any) => ({
      clienteRazonSocial: r.f_cliente_desp_razon_soc,
      lote: r.f_lote,
      pedidoDocumento: r.f_pedido_docto,
      numeroDocumento: r.f_nrodocto,
      facturaDocumento: r.f_factura_docto,
      fecha: r.f_fecha,
      item: r.f_item,
      ordenCompra: r.f_orden_compra,
      referencia: r.f_referencia,
      descripcionItem: r.f_desc_item,
      cantidad: r.f_cant_base,
      precioUnitario: r.f_precio_unit_docto,
      precioPeso: r.f_precio_peso,
      peso: r.f_peso,
      volumen: r.f_vol,
      estado: r.f_estado,
      vehiculo: r.f_vehiculo,
      nombreConductor: r.f_nombre_conductor,
      identificacionConductor: r.f_identif_conductor,
      vendedor: r.f_vendedor_razon_social,
      ciudad: r.f_ciudad,
      ciudadEnvio: r.f_ciudad_envio,
      descripcionPuntoEnvio: r.f_desc_punto_envio,
      valorBruto: r.f_valor_bruto_docto,
      valorImpuesto: r.f_valor_imp_docto,
      valorNeto: r.f_valor_neto_docto,
      bodega: r.f_bodega,
      plan003: r.f_01_003,
      notas: r.f_notas,
      notasMovimiento: r.f_notas_movto,
      cdv: r.f_02_CDV,
      numero: r.f_numero,
    }));
    // Nota: se excluyen a propósito f_divisor_margen_prom (cálculo interno de
    // margen), f_vendedor/f_punto_envio (códigos internos, se expone su
    // descripción en su lugar), f_id_clase_docto/f_rowid/f_rowid_movto
    // (llaves internas de SIESA) y f_destare_ocul (bandera interna de
    // destare) — no deben exponerse al cliente.
    */

    // ────────────────────────────────────────────────────────────────────
    // Datos quemados temporales mientras no hay acceso a SIESA. Borrar
    // este bloque al descomentar el de arriba.
    // ────────────────────────────────────────────────────────────────────
    return [
      {
        clienteRazonSocial: 'INDUSTRIAS CARTON',
        lote: 'L-230721',
        pedidoDocumento: 'PV-00259993',
        numeroDocumento: 'REM-00184532',
        facturaDocumento: 'FV-00098211',
        fecha: '2026-07-15T00:00:00.000Z',
        item: 421103,
        ordenCompra: '19078',
        referencia: 'BAR00002571571',
        descripcionItem: '09568  CAJA CJ 3550',
        cantidad: 505.0,
        precioUnitario: 2409.0,
        precioPeso: 3942.7169,
        peso: 293.28,
        volumen: 603.36,
        estado: 'Contabilizada y facturada',
        vehiculo: 'ABC123',
        nombreConductor: 'CARLOS PEREZ',
        identificacionConductor: '79456123',
        vendedor: 'DAVID LANCHEROS',
        ciudad: 'SIBERIA',
        ciudadEnvio: '25-SIBERIA',
        descripcionPuntoEnvio: 'BODEGA PRINCIPAL',
        valorBruto: 1216545.0,
        valorImpuesto: 231064.0,
        valorNeto: 1447609.0,
        bodega: '01',
        plan003: '3 - PROPIO',
        notas: null,
        notasMovimiento: null,
        cdv: null,
        numero: 184532,
      },
    ];
  }
}
