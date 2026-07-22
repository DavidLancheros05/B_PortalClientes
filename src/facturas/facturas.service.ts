import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { FacturaClienteResponseDto } from './dto/factura-cliente.response.dto';

@Injectable()
export class FacturasService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  async getFacturasPorCliente(
    cliId: number,
  ): Promise<FacturaClienteResponseDto[]> {
    const cliente = await this.clienteRepo.findOne({ where: { cli_id: cliId } });
    const nit = cliente?.cli_nro_identificacion;

    // ────────────────────────────────────────────────────────────────────
    // Pendiente: acceso real a SIESA (ver
    // documentacion/plan-migracion-clientes-siesa.md), igual que en
    // pedidos.service.ts y remisiones.service.ts. Consulta va contra la BD
    // de SIESA, no contra la BD del portal — necesita su propia conexión
    // (`mssql`/DataSource aparte), distinta de `this.clienteRepo` de
    // arriba. Cuando exista esa conexión, descomentar este bloque,
    // reemplazar `siesaDataSource` por la instancia real, y borrar el
    // bloque de datos quemados de abajo.
    //
    // Origen: "3. Consulta de facturas y notas.sql" (aportada por el
    // usuario el 2026-07-21). El filtro de cliente venía comentado en el
    // original (`--AND t200_fact.f200_id = '800154771'`) — se activó y
    // parametrizó como `AND t200_fact.f200_id = @p_nit`, igual criterio
    // usado para acotar por cliente en pedidos/remisiones.
    // ────────────────────────────────────────────────────────────────────
    /*
    const rows = await siesaDataSource.query(
      `
      DECLARE @p_cia            SMALLINT   = 2
      DECLARE @p_tipo_docto     CHAR(3)    = 'FEV'
      DECLARE @p_tipo_inv       CHAR(10)   = '3'
      DECLARE @p_fec_inicial    DATETIME   = DATEADD(YEAR, -5, CAST(GETDATE() AS DATE))
      DECLARE @p_fec_final      DATETIME   = CAST(GETDATE() AS DATE)
      DECLARE @p_ind_estado     SMALLINT   = 0      -- 0=todos, 1=elaboración, 2=aprobados, 4=anulados, 5=no anulados
      DECLARE @p_permiso_costos SMALLINT   = 1
      DECLARE @p_co             CHAR(3)    = ''
      DECLARE @p_grupo          CHAR(3)    = ''
      DECLARE @p_instalacion    CHAR(3)    = ''
      DECLARE @p_bodega         INT        = 0
      DECLARE @p_rowid_item     INT        = 0
      DECLARE @p_rowid_facturar INT        = 0
      DECLARE @p_rowid_despachar INT       = 0
      DECLARE @p_ind_cliente    SMALLINT   = 0      -- 0=cliente factura, 1=cliente despacho
      DECLARE @v_ind_item_cod_ref SMALLINT = 0      -- leer de t100_pp_comerciales.f100_ind_item_cod_ref
      DECLARE @p_nit            CHAR(20)   = @0

      SELECT

          f461.f461_id_fecha                                          AS f_fecha,

          t200_fact.f200_id                                           AS f_cliente_fact,

          t200_vend.f200_razon_social                                 AS f_vendedor_razon_social,

          t200_desp.f200_razon_social                                 AS f_cliente_desp_razon_soc,

          RTRIM(t350_fact.f350_id_tipo_docto)
              + '-' + dbo.lpad(t350_fact.f350_consec_docto, 8, '0') AS f_nrodocto,

          f461.f461_num_docto_referencia                              AS f_orden_compra,

          ISNULL(
              RTRIM(t430_ped.f430_id_tipo_docto)
                  + '-' + dbo.lpad(t430_ped.f430_consec_docto, 8, '0'),
              ' ')                                                    AS f_pedido_docto,

          RTRIM(dbo.f_remover_enter_consulta(t120.f120_descripcion))  AS f_desc_item,

          ROUND(
              t470.f470_cant_base
              * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
          , 4)                                                        AS f_cant_emp,

          t470.f470_precio_uni                                        AS f_precio_unit_docto,

          CASE
              WHEN f461.f461_id_moneda_docto = t010.f010_id_moneda_local
              THEN (t470.f470_vlr_bruto - t470.f470_vlr_dscto_linea - t470.f470_vlr_dscto_global)
                   * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
              ELSE (t470.f470_vlr_bruto_alt - t470.f470_vlr_dscto_linea_alt - t470.f470_vlr_dscto_global_alt)
                   * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
          END                                                         AS f_valor_subtotal_docto,

          CASE
              WHEN f461.f461_id_moneda_docto = t010.f010_id_moneda_local
              THEN t470.f470_vlr_imp * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
              ELSE t470.f470_vlr_imp_alt * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
          END                                                         AS f_valor_imp_docto,

          ROUND(
          (CASE
              WHEN t120.f120_id_unidad_adicional IS NOT NULL
                   AND f100.f100_id_unidad_peso = t120.f120_id_unidad_adicional
                   AND ISNULL(t122_inv.f122_peso, 0) = 0
              THEN CASE WHEN t350_fact.f350_id_clase_docto IN (531, 529)
                        THEN t470.f470_cant_base
                        ELSE t470.f470_cant_2
                   END
              ELSE CASE WHEN t350_fact.f350_id_clase_docto IN (531, 529)
                        THEN t470.f470_cant_base * t122_e.f122_peso
                        ELSE t470.f470_cant_base * t122_e.f122_peso
                   END
          END)
          * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
          / 1000000.0
          , 2)                                                        AS f_peso,

          t120.f120_id                                                AS f_item,

          t150.f150_id                                                AS f_bodega,

          CASE
              WHEN f461.f461_id_moneda_docto = t010.f010_id_moneda_local
              THEN t470.f470_vlr_neto * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
              ELSE t470.f470_vlr_neto_alt * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
          END                                                         AS f_valor_neto_docto,

          (t470.f470_vlr_bruto - t470.f470_vlr_dscto_linea - t470.f470_vlr_dscto_global)
              * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END)
                                                                      AS f_valor_subtotal_local,

          dbo.F_GENERICO_HALLAR_PREC_VTA(
              f461.f461_id_cia,
              t201_desp.f201_id_lista_precio,
              t470.f470_rowid_item_ext,
              f461.f461_id_fecha,
              t470.f470_id_unidad_medida
          )                                                           AS f_precio_cli,

          ISNULL(
              RTRIM(t350_rem.f350_id_tipo_docto)
                  + '-' + dbo.lpad(t350_rem.f350_consec_docto, 8, '0'),
              ' ')                                                    AS f_documento_rem,

          CASE
              WHEN @v_ind_item_cod_ref = 1
              THEN dbo.lpad(t120.f120_id, 8, '0')
                   + CASE WHEN t121.f121_id_ext1_detalle IS NULL
                          THEN ' ' + t120.f120_descripcion
                          ELSE ' - ' + RTRIM(t121.f121_id_ext1_detalle)
                               + ISNULL(' - ' + RTRIM(t121.f121_id_ext2_detalle), '')
                               + '  ' + RTRIM(t120.f120_descripcion_corta)
                     END
              ELSE RTRIM(t120.f120_referencia)
                   + CASE WHEN t121.f121_id_ext1_detalle IS NULL
                          THEN ' ' + t120.f120_descripcion
                          ELSE ' - ' + RTRIM(t121.f121_id_ext1_detalle)
                               + ISNULL(' - ' + RTRIM(t121.f121_id_ext2_detalle), '')
                               + '  ' + RTRIM(t120.f120_descripcion_corta)
                     END
          END                                                         AS f_item_resumen,

          RTRIM(t120.f120_referencia)                                 AS f_referencia,

          t215.f215_descripcion                                       AS f_desc_punto_envio,

          t01_003.v125_descripcion                                    AS f_01_003,

          t013_doc.f013_descripcion                                   AS f_desc_ciudad,

          ISNULL(t02_SEC.v207_descripcion, ' ')                       AS f_02_SEC,

          ISNULL(t02_SSE.v207_descripcion, ' ')                       AS f_02_SSE,

          t01_001.v125_descripcion                                    AS f_01_001,

          t200_desp.f200_id                                           AS f_id_vend_rem,

          t120.f120_descripcion_corta                                 AS f_desc_corta,

          t200_vend_cli.f200_razon_social                             AS f_vendedor_nombre_cliente,

          CASE WHEN ISNULL(t122_um.f122_peso, 0) = 0 THEN 0
               ELSE t470.f470_precio_uni / t122_um.f122_peso
          END                                                         AS f_precio_peso,

          t350_fact.f350_id_co                                        AS f_co,

          ((CASE ISNULL(f100.f100_ind_calculo_margen_vta, 0)
              WHEN 0 THEN ((t470.f470_vlr_bruto - t470.f470_vlr_dscto_linea - t470.f470_vlr_dscto_global)
                           + t470.f470_vlr_imp_margen)
              ELSE t470.f470_costo_prom_tot
            END)
           * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END))
                                                                      AS f_divisor_margen_prom,

          t470.f470_rowid                                             AS f_rowid_movto,

          (((t470.f470_vlr_bruto - t470.f470_vlr_dscto_linea - t470.f470_vlr_dscto_global
             + t470.f470_vlr_imp_margen) - t470.f470_costo_prom_tot)
           * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END))
                                                                      AS f_utilidad_prom_f,

          f461.f461_rowid_docto                                       AS f_rowid,
          t350_fact.f350_consec_docto                                 AS f_numero,
          f461.f461_id_clase_docto                                    AS f_id_clase_docto,

          ((CASE ISNULL(f100.f100_ind_calculo_margen_vta, 0)
              WHEN 0 THEN ((t470.f470_vlr_bruto - t470.f470_vlr_dscto_linea - t470.f470_vlr_dscto_global)
                           + t470.f470_vlr_imp_margen)
              ELSE (t470.f470_costo_mp_en + t470.f470_costo_mp_np)
            END)
           * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END))
                                                                      AS f_divisor_margen_mp,

          (((t470.f470_vlr_bruto - t470.f470_vlr_dscto_linea - t470.f470_vlr_dscto_global
             + t470.f470_vlr_imp_margen)
            - (t470.f470_costo_mp_en + t470.f470_costo_mp_np))
           * (CASE t470.f470_ind_naturaleza WHEN 1 THEN -1 ELSE 1 END))
                                                                      AS f_utilidad_mp_f,

          t010.f010_id                                                AS f_cia,

          CASE WHEN tp_destare.f_rowid_movto IS NULL THEN 0 ELSE 1 END
                                                                      AS f_destare_ocul

      FROM  t350_co_docto_contable            t350_fact
      INNER JOIN t461_cm_docto_factura_venta  f461
              ON  f461.f461_rowid_docto       = t350_fact.f350_rowid
      INNER JOIN t470_cm_movto_invent         t470
              ON  t470.f470_rowid_docto_fact  = f461.f461_rowid_docto
      INNER JOIN t150_mc_bodegas              t150
              ON  t150.f150_rowid             = t470.f470_rowid_bodega
      INNER JOIN t121_mc_items_extensiones    t121
              ON  t121.f121_rowid             = t470.f470_rowid_item_ext
      INNER JOIN t120_mc_items                t120
              ON  t120.f120_rowid             = t121.f121_rowid_item
      LEFT  JOIN t010_mm_companias            t010
              ON  t010.f010_id                = f461.f461_id_cia
      INNER JOIN t028_mm_clases_documento     t028
              ON  t028.f028_id                = f461.f461_id_clase_docto
      INNER JOIN t122_mc_items_unidades       t122_um
              ON  t122_um.f122_id_cia         = t470.f470_id_cia
              AND t122_um.f122_id_unidad      = t470.f470_id_unidad_medida
              AND t122_um.f122_rowid_item     = t120.f120_rowid
      INNER JOIN t122_mc_items_unidades       t122_inv
              ON  t122_inv.f122_id_cia        = t470.f470_id_cia
              AND t122_inv.f122_id_unidad     = t120.f120_id_unidad_inventario
              AND t122_inv.f122_rowid_item    = t120.f120_rowid
      INNER JOIN t285_co_centro_op            t285_docto
              ON  t285_docto.f285_id_cia      = t350_fact.f350_id_cia
              AND t285_docto.f285_id          = t350_fact.f350_id_co
      INNER JOIN t021_mm_tipos_documentos     t021
              ON  t021.f021_id_cia            = t350_fact.f350_id_cia
              AND t021.f021_id                = t350_fact.f350_id_tipo_docto
      INNER JOIN t200_mm_terceros             t200_fact
              ON  t200_fact.f200_rowid        = f461.f461_rowid_tercero_fact
      INNER JOIN t201_mm_clientes             t201_fact
              ON  t201_fact.f201_rowid_tercero = f461.f461_rowid_tercero_fact
              AND t201_fact.f201_id_sucursal   = f461.f461_id_sucursal_fact
      INNER JOIN t200_mm_terceros             t200_desp
              ON  t200_desp.f200_rowid        = f461.f461_rowid_tercero_rem
      INNER JOIN t201_mm_clientes             t201_desp
              ON  t201_desp.f201_rowid_tercero = f461.f461_rowid_tercero_rem
              AND t201_desp.f201_id_sucursal   = f461.f461_id_sucursal_rem
      INNER JOIN t200_mm_terceros             t200_vend
              ON  t200_vend.f200_rowid        = f461.f461_rowid_tercero_vendedor
      INNER JOIN t278_co_tipo_cli             t278
              ON  t278.f278_id_cia            = f461.f461_id_cia
              AND t278.f278_id                = f461.f461_id_tipo_cli_fact
      INNER JOIN t208_mm_condiciones_pago     t208
              ON  t208.f208_id_cia            = f461.f461_id_cia
              AND t208.f208_id                = f461.f461_id_cond_pago
      INNER JOIN t253_co_auxiliares           t253
              ON  t253.f253_rowid             = f461.f461_rowid_aux_cxc
      INNER JOIN t149_mc_tipo_inv_serv        t149
              ON  t149.f149_id_cia            = t120.f120_id_cia
              AND t149.f149_id                = t120.f120_id_tipo_inv_serv
      INNER JOIN t100_pp_comerciales          f100
              ON  f100.f100_id_cia            = t470.f470_id_cia
      LEFT  JOIN t122_mc_items_unidades       t122_e
              ON  t122_e.f122_id_cia          = t120.f120_id_cia
              AND t122_e.f122_rowid_item      = t120.f120_rowid
              AND t122_e.f122_id_unidad       = t120.f120_id_unidad_empaque

      LEFT  JOIN t285_co_centro_op            t285_movto
              ON  t285_movto.f285_id_cia      = t470.f470_id_cia
              AND t285_movto.f285_id          = t470.f470_id_co_movto
      LEFT  JOIN t403_cm_lotes                t403
              ON  t403.f403_id_cia            = t470.f470_id_cia
              AND t403.f403_id                = t470.f470_id_lote
              AND t403.f403_rowid_item_ext    = t470.f470_rowid_item_ext
      LEFT  JOIN t215_mm_puntos_envio_cliente t215
              ON  t215.f215_rowid             = f461.f461_rowid_punto_envio_rem
      LEFT  JOIN t015_mm_contactos            t015_envio
              ON  t015_envio.f015_rowid       = t215.f215_rowid_contacto
      LEFT  JOIN t419_mc_contactos_docto      t419
              ON  t419.f419_rowid             = f461.f461_rowid_contacto_docto_rem
      LEFT  JOIN t013_mm_ciudades             t013_doc
              ON  t013_doc.f013_id_pais  = ISNULL(t419.f419_id_pais,  t015_envio.f015_id_pais)
              AND t013_doc.f013_id_depto = ISNULL(t419.f419_id_depto, t015_envio.f015_id_depto)
              AND t013_doc.f013_id       = ISNULL(t419.f419_id_ciudad, t015_envio.f015_id_ciudad)
      LEFT  JOIN t350_co_docto_contable       t350_rem
              ON  t350_rem.f350_rowid         = t470.f470_rowid_docto
      LEFT  JOIN t460_cm_docto_remision_venta t460_ped
              ON  t460_ped.f460_rowid_docto   = t470.f470_rowid_docto
      LEFT  JOIN t430_cm_pv_docto             t430_ped
              ON  t430_ped.f430_rowid         = t460_ped.f460_rowid_pv_docto
      LEFT  JOIN t117_mc_extensiones1_detalle t117
              ON  t117.f117_id_cia            = t121.f121_id_cia
              AND t117.f117_id_extension1     = t121.f121_id_extension1
              AND t117.f117_id                = t121.f121_id_ext1_detalle
      LEFT  JOIN t119_mc_extensiones2_detalle t119
              ON  t119.f119_id_cia            = t121.f121_id_cia
              AND t119.f119_id_extension2     = t121.f121_id_extension2
              AND t119.f119_id                = t121.f121_id_ext2_detalle
      LEFT  JOIN t210_mm_vendedores           t210_vend_cli
              ON  t210_vend_cli.f210_id_cia   = t201_desp.f201_id_cia
              AND t210_vend_cli.f210_id       = t201_desp.f201_id_vendedor
      LEFT  JOIN t200_mm_terceros             t200_vend_cli
              ON  t200_vend_cli.f200_rowid    = t210_vend_cli.f210_rowid_tercero
      LEFT  JOIN (
          SELECT  f485_rowid_movto            AS f_rowid_movto
          FROM    t485_cm_movto_destare
          INNER JOIN t470_cm_movto_invent tp_t470
                  ON  f485_rowid_movto        = tp_t470.f470_rowid
          INNER JOIN t350_co_docto_contable   tp_t350
                  ON  tp_t470.f470_rowid_docto_fact = tp_t350.f350_rowid
          WHERE   tp_t350.f350_id_clase_docto IN (520,521,522,525,526,523,529,531,534,1249,1250,1251,542)
            AND   tp_t350.f350_id_cia         IN (2)
            AND   tp_t350.f350_fecha          BETWEEN @p_fec_inicial AND @p_fec_final
            AND   tp_t350.f350_id_tipo_docto  = @p_tipo_docto
          GROUP BY f485_rowid_movto
      ) tp_destare
              ON  tp_destare.f_rowid_movto    = t470.f470_rowid

      LEFT  JOIN v125                         t01_003
              ON  t01_003.v125_rowid_item     = t121.f121_rowid_item
              AND t01_003.v125_id_plan        = '003'

      LEFT  JOIN v125                         t01_001
              ON  t01_001.v125_rowid_item     = t121.f121_rowid_item
              AND t01_001.v125_id_plan        = '001'

      LEFT  JOIN v207                         t02_SEC
              ON  t02_SEC.v207_rowid_tercero  = f461.f461_rowid_tercero_fact
              AND t02_SEC.v207_id_sucursal    = f461.f461_id_sucursal_fact
              AND t02_SEC.v207_id_plan_criterios = 'SEC'

      LEFT  JOIN v207                         t02_SSE
              ON  t02_SSE.v207_rowid_tercero  = f461.f461_rowid_tercero_fact
              AND t02_SSE.v207_id_sucursal    = f461.f461_id_sucursal_fact
              AND t02_SSE.v207_id_plan_criterios = 'SSE'

      WHERE
          t350_fact.f350_id_clase_docto   IN (520,521,522,525,526,523,529,531,534,1249,1250,1251,542)
          AND t350_fact.f350_id_cia       IN (2)                     -- @v_grupo_cias
          AND t350_fact.f350_fecha        BETWEEN @p_fec_inicial AND @p_fec_final
          AND t350_fact.f350_id_tipo_docto = @p_tipo_docto           -- 'FEV'
          AND t120.f120_id_tipo_inv_serv  = @p_tipo_inv              -- '3'
          AND t200_fact.f200_id           = @p_nit                  -- filtro cliente factura

      ORDER BY
          f461.f461_id_fecha,
          t200_fact.f200_id,
          RTRIM(t350_fact.f350_id_tipo_docto)
              + '-' + dbo.lpad(t350_fact.f350_consec_docto, 8, '0'),
          t120.f120_id
      `,
      [nit],
    );

    return rows.map((r: any) => ({
      fecha: r.f_fecha,
      nit: r.f_cliente_fact,
      vendedor: r.f_vendedor_razon_social,
      clienteRazonSocial: r.f_cliente_desp_razon_soc,
      numeroDocumento: r.f_nrodocto,
      ordenCompra: r.f_orden_compra,
      pedidoDocumento: r.f_pedido_docto,
      documentoRemision: r.f_documento_rem,
      item: r.f_item,
      referencia: r.f_referencia,
      descripcionItem: r.f_desc_item,
      descripcionCorta: r.f_desc_corta,
      itemResumen: r.f_item_resumen,
      cantidad: r.f_cant_emp,
      precioUnitario: r.f_precio_unit_docto,
      precioCliente: r.f_precio_cli,
      precioPeso: r.f_precio_peso,
      peso: r.f_peso,
      valorSubtotal: r.f_valor_subtotal_docto,
      valorSubtotalLocal: r.f_valor_subtotal_local,
      valorImpuesto: r.f_valor_imp_docto,
      valorNeto: r.f_valor_neto_docto,
      bodega: r.f_bodega,
      centroOperacion: r.f_co,
      ciudad: r.f_desc_ciudad,
      descripcionPuntoEnvio: r.f_desc_punto_envio,
      plan001: r.f_01_001,
      plan003: r.f_01_003,
      sec: r.f_02_SEC,
      sse: r.f_02_SSE,
      vendedorClienteNombre: r.f_vendedor_nombre_cliente,
      numero: r.f_numero,
    }));
    // Nota: se excluyen a propósito f_divisor_margen_prom, f_divisor_margen_mp,
    // f_utilidad_prom_f, f_utilidad_mp_f (cálculos internos de margen/utilidad),
    // f_id_vend_rem (código interno, ya se expone su nombre vía
    // vendedorClienteNombre), f_id_clase_docto/f_rowid/f_rowid_movto (llaves
    // internas de SIESA), f_cia (id de compañía, fijo por instancia) y
    // f_destare_ocul (bandera interna de destare) — no deben exponerse al
    // cliente.
    */

    // ────────────────────────────────────────────────────────────────────
    // Datos quemados temporales mientras no hay acceso a SIESA. Borrar
    // este bloque al descomentar el de arriba.
    // ────────────────────────────────────────────────────────────────────
    return [
      {
        fecha: '2026-07-16T00:00:00.000Z',
        nit: '800099999',
        vendedor: 'DAVID LANCHEROS',
        clienteRazonSocial: 'INDUSTRIAS CARTON',
        numeroDocumento: 'FEV-00098211',
        ordenCompra: '19078',
        pedidoDocumento: 'PV-00259993',
        documentoRemision: 'REM-00184532',
        item: 421103,
        referencia: 'BAR00002571571',
        descripcionItem: '09568  CAJA CJ 3550',
        descripcionCorta: 'CAJA CJ 3550',
        itemResumen: 'BAR00002571571 - 09568  CAJA CJ 3550',
        cantidad: 505.0,
        precioUnitario: 2409.0,
        precioCliente: 2409.0,
        precioPeso: 3942.7169,
        peso: 293.28,
        valorSubtotal: 1216545.0,
        valorSubtotalLocal: 1216545.0,
        valorImpuesto: 231064.0,
        valorNeto: 1447609.0,
        bodega: '01',
        centroOperacion: '001',
        ciudad: 'SIBERIA',
        descripcionPuntoEnvio: 'BODEGA PRINCIPAL',
        plan001: null,
        plan003: '3 - PROPIO',
        sec: null,
        sse: null,
        vendedorClienteNombre: 'DAVID LANCHEROS',
        numero: 98211,
      },
    ];
  }
}
