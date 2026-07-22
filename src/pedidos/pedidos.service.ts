import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { PedidoClienteResponseDto } from './dto/pedido-cliente.response.dto';

@Injectable()
export class PedidosService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  async getPedidosPorCliente(
    cliId: number,
  ): Promise<PedidoClienteResponseDto[]> {
    const cliente = await this.clienteRepo.findOne({ where: { cli_id: cliId } });
    const nit = cliente?.cli_nro_identificacion;

    // ────────────────────────────────────────────────────────────────────
    // Pendiente: acceso real a SIESA (ver
    // documentacion/plan-migracion-clientes-siesa.md). Esta consulta va
    // contra la BD de SIESA, no contra la BD del portal — necesita su
    // propia conexión (`mssql`/DataSource aparte, apuntando al servidor de
    // SIESA), distinta de `this.clienteRepo` de arriba. Cuando exista esa
    // conexión, descomentar este bloque, reemplazar `siesaDataSource` por
    // la instancia real, y borrar el bloque de datos quemados de abajo.
    //
    // Consulta verificada contra SIESA el 2026-07-21 (origen: archivo
    // "1. Consulta de Pedido por Item.sql", NIT de prueba 800092967).
    // ────────────────────────────────────────────────────────────────────
    /*
    const rows = await siesaDataSource.query(
      `
      DECLARE @p_cia          SMALLINT = 1
      DECLARE @p_tipo_inv     CHAR(10) = '3'
      DECLARE @p_fec_inicial  DATETIME = DATEADD(YEAR, -5, CAST(GETDATE() AS DATE))  -- hoy - 5 años (dinámico)
      DECLARE @p_fec_final    DATETIME = CAST(GETDATE() AS DATE)                     -- hoy (dinámico)
      DECLARE @p_nit VARCHAR(20) = @0

      ;WITH t430_meta AS (
          SELECT
              f430_rowid                                                  AS f_rowid_docto,
              f430_ind_tasa                                               AS f_ind_tasa,
              f430_id_moneda_docto                                        AS f_id_moneda_docto,
              CASE WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f430_ind_tasa = 0
                   THEN f010_id_moneda_conversion
                   ELSE f430_id_moneda_conv
              END                                                         AS f_id_moneda_conv,
              CASE WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f430_ind_tasa = 0
                   THEN f010_id_moneda_local
                   ELSE f430_id_moneda_local
              END                                                         AS f_id_moneda_local,
              CASE WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f010_id_moneda_local = f010_id_moneda_conversion
                        AND f430_ind_tasa = 0
                   THEN f430_ind_forma_conv
                   WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f430_ind_tasa = 0
                   THEN ISNULL(t_mondocto.f017_ind_forma_conversion, 0)
                   ELSE f430_ind_forma_conv
              END                                                         AS f_ind_forma_conv,
              CASE WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f430_ind_tasa = 0
                   THEN ISNULL(t_tasas.f1_tasa_moneda_docto, 1.00)
                   ELSE f430_tasa_conv
              END                                                         AS f_tasa_conv,
              CASE WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f430_ind_tasa = 0
                   THEN t_monloc.f017_ind_forma_conversion
                   ELSE f430_ind_forma_local
              END                                                         AS f_ind_forma_local,
              CASE WHEN f430_id_moneda_docto <> f010_id_moneda_local
                        AND f430_ind_tasa = 0
                   THEN CASE WHEN f010_id_moneda_local = ISNULL(f010_id_moneda_conversion, ' ')
                             THEN ISNULL(t_tasas.f1_tasa_moneda_docto, 1.00)
                             ELSE ISNULL(t_tasas.f1_tasa_moneda_local, 1.00)
                        END
                   ELSE f430_tasa_local
              END                                                         AS f_tasa_local,
              t_mondocto.f017_dec_compra_venta                            AS f_dec_docto,
              t_monloc.f017_dec_compra_venta                              AS f_dec_local,
              f430_rowid_tercero_fact                                     AS f_rowid_tercero_fact,
              f430_id_sucursal_fact                                       AS f_id_sucursal_fact,
              f430_id_clase_docto                                         AS f_id_clase_docto,
              f430_fecha_entrega_min                                      AS f_fecha_entrega_min,
              f430_fecha_entrega_max                                      AS f_fecha_entrega_max,
              f430_fecha_entrega                                          AS f_fecha_entrega_pedido
          FROM   t430_cm_pv_docto
          INNER  JOIN t010_mm_companias
                  ON  f010_id                    = f430_id_cia
          INNER  JOIN t017_mm_monedas t_mondocto
                  ON  t_mondocto.f017_id_cia     = f430_id_cia
                  AND t_mondocto.f017_id         = f430_id_moneda_docto
          INNER  JOIN t017_mm_monedas t_monloc
                  ON  t_monloc.f017_id_cia       = f010_id
                  AND t_monloc.f017_id           = f010_id_moneda_local
          LEFT   JOIN t017_mm_monedas t_monconv
                  ON  t_monconv.f017_id_cia      = f010_id
                  AND t_monconv.f017_id          = f010_id_moneda_conversion
          LEFT   JOIN (
              SELECT
                  f430_rowid                                              AS f1_rowid_pv_docto,
                  dbo.F_monedas_leer_tasa_fecha(
                      f430_id_cia, f430_id_moneda_docto,
                      f430_id_fecha, f430_id_tipo_cambio)                AS f1_tasa_moneda_docto,
                  CASE WHEN f010_id_moneda_local = ISNULL(f010_id_moneda_conversion, ' ')
                       THEN 1.00
                       ELSE dbo.F_monedas_leer_tasa_fecha(
                                f430_id_cia, f010_id_moneda_local,
                                f430_id_fecha, f430_id_tipo_cambio)
                  END                                                     AS f1_tasa_moneda_local
              FROM   t430_cm_pv_docto
              INNER  JOIN t010_mm_companias t010_mm_companias_1
                      ON  t010_mm_companias_1.f010_id = f430_id_cia
                      AND f430_id_moneda_docto <> t010_mm_companias_1.f010_id_moneda_local
              INNER  JOIN t200_mm_terceros t200_fact
                      ON  t200_fact.f200_rowid   = f430_rowid_tercero_fact
              INNER  JOIN t200_mm_terceros t200_desp
                      ON  t200_desp.f200_rowid   = f430_rowid_tercero_fact
              WHERE  f430_id_cia = @p_cia
                AND  f430_ind_tasa = 0
          )                                      t_tasas
                  ON  t_tasas.f1_rowid_pv_docto  = f430_rowid
          INNER  JOIN t200_mm_terceros t200_fact
                  ON  t200_fact.f200_rowid       = f430_rowid_tercero_fact
          INNER  JOIN t200_mm_terceros t200_desp
                  ON  t200_desp.f200_rowid       = f430_rowid_tercero_fact
          WHERE  f430_id_cia = @p_cia
      ),

      v431 AS (
          SELECT
              f431_ts                                                     AS v431_ts,
              f431_rowid                                                  AS v431_rowid,
              f431_rowid_pv_docto                                         AS v431_rowid_pv_docto,
              f431_id_cia                                                 AS v431_id_cia,
              f431_rowid_item_ext                                         AS v431_rowid_item_ext,
              f431_rowid_bodega                                           AS v431_rowid_bodega,
              f431_id_concepto                                            AS v431_id_concepto,
              f431_id_motivo                                              AS v431_id_motivo,
              f431_fecha                                                  AS v431_fecha,
              f431_ind_estado                                             AS v431_ind_estado,
              f431_ind_obsequio                                           AS v431_ind_obsequio,
              f431_id_co_movto                                            AS v431_id_co_movto,
              f431_id_un_movto                                            AS v431_id_un_movto,
              f431_rowid_ccosto_movto                                     AS v431_rowid_ccosto_movto,
              f431_id_proyecto                                            AS v431_id_proyecto,
              f431_id_lista_precio                                        AS v431_id_lista_precio,
              f431_fecha_entrega                                          AS v431_fecha_entrega,
              f431_rowid_punto_envio_rem                                  AS v431_rowid_punto_envio_rem,
              f431_precio_unitario_base                                   AS v431_precio_unitario_base,
              f431_id_unidad_medida                                       AS v431_id_unidad_medida,
              f431_factor                                                 AS v431_factor,
              f431_notas                                                  AS v431_notas,
              f431_fecha_ts_creacion                                      AS v431_fecha_ts_creacion,
              f431_id_unidad_medida_captura                               AS v431_id_unidad_medida_captura,
              f431_id_motivo_otros                                        AS v431_id_motivo_otros,
              f431_rowid_movto_entidad                                    AS v431_rowid_movto_entidad,
              f431_rowid_tercero_vendedor                                 AS v431_rowid_tercero_vendedor,
              t430.f_rowid_tercero_fact                                   AS v431_rowid_tercero_fact,
              t430.f_id_sucursal_fact                                     AS v431_id_sucursal_fact,
              t430.f_id_moneda_docto                                      AS v431_id_moneda_docto,
              t430.f_dec_local                                            AS v431_dec_local,
              t430.f_dec_docto                                            AS v431_dec_docto,
              t430.f_fecha_entrega_min                                    AS v431_fecha_entrega_min,
              t430.f_fecha_entrega_max                                    AS v431_fecha_entrega_max,
              t430.f_fecha_entrega_pedido                                 AS v431_fecha_entrega_pedido,

              f431_cant_pedida_base                                       AS v431_cant_pedida_base,
              f431_cant_remisionada_base                                  AS v431_cant_remisionada_base,
              f431_cant_comprometida_base                                 AS v431_cant_comprometida_base,
              f431_cant_facturada_base                                    AS v431_cant_facturada_base,
              CASE WHEN t430.f_id_clase_docto = 508
                   THEN CASE WHEN f431_cant_facturada_base > f431_cant_pedida_base THEN 0
                             ELSE f431_cant_pedida_base - f431_cant_facturada_base END
                   ELSE CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                             ELSE f431_cant_pedida_base - f431_cant_remisionada_base END
              END                                                         AS v431_cant_pendiente_base,
              f431_cant1_pedida                                           AS v431_cant1_pedida,
              f431_cant1_remisionada                                      AS v431_cant1_remisionada,
              f431_cant1_comprometida                                     AS v431_cant1_comprometida,
              f431_cant1_facturada                                        AS v431_cant1_facturada,
              CASE WHEN t430.f_id_clase_docto = 508
                   THEN CASE WHEN f431_cant1_facturada > f431_cant1_pedida THEN 0
                             ELSE f431_cant1_pedida - f431_cant1_facturada END
                   ELSE CASE WHEN f431_cant1_remisionada > f431_cant1_pedida THEN 0
                             ELSE f431_cant1_pedida - f431_cant1_remisionada END
              END                                                         AS v431_cant1_pendiente,
              f431_cant2_pedida                                           AS v431_cant2_pedida,
              f431_cant2_remisionada                                      AS v431_cant2_remisionada,
              f431_cant2_comprometida                                     AS v431_cant2_comprometida,
              f431_cant2_facturada                                        AS v431_cant2_facturada,
              CASE WHEN t430.f_id_clase_docto = 508
                   THEN CASE WHEN f431_cant2_facturada > f431_cant2_pedida THEN 0
                             ELSE f431_cant2_pedida - f431_cant2_facturada END
                   ELSE CASE WHEN f431_cant2_remisionada > f431_cant2_pedida THEN 0
                             ELSE f431_cant2_pedida - f431_cant2_remisionada END
              END                                                         AS v431_cant2_pendiente,

              f431_vlr_bruto                                              AS v431_vlr_bruto_ped_docto,
              f431_vlr_dscto_linea + f431_vlr_dscto_global               AS v431_vlr_dscto_ped_docto,
              f431_vlr_bruto - f431_vlr_dscto_linea - f431_vlr_dscto_global AS v431_vlr_subtotal_ped_docto,
              f431_vlr_imp                                                AS v431_vlr_imp_ped_docto,
              f431_vlr_neto                                               AS v431_vlr_neto_ped_docto,
              f431_vlr_imp_margen                                         AS v431_vlr_imp_margen_ped_docto,

              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_bruto_pen_docto,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_dscto_pen_docto,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_subtotal_pen_docto,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_pen_docto,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)
              + ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                      * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_neto_pen_docto,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_imp_margen / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_margen_pen_docto,

              ROUND(f431_cant_comprometida_base * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_bruto_com_docto,
              ROUND(f431_cant_comprometida_base * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_dscto_com_docto,
              ROUND(f431_cant_comprometida_base * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND(f431_cant_comprometida_base * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
                                                                          AS v431_vlr_subtotal_com_docto,
              ROUND(f431_cant_comprometida_base * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_com_docto,
              ROUND(f431_cant_comprometida_base * (f431_vlr_neto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_neto_com_docto,
              ROUND(f431_cant_comprometida_base * (f431_vlr_imp_margen / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_margen_com_docto,

              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_bruto_x_com_docto,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_dscto_x_com_docto,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_subtotal_x_com_docto,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_x_com_docto,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)
              + ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                      * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_neto_x_com_docto,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_imp_margen / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_margen_x_com_doc,

              f431_vlr_bruto                                              AS v431_vlr_bruto_ped_local,
              f431_vlr_dscto_linea + f431_vlr_dscto_global               AS v431_vlr_dscto_ped_local,
              f431_vlr_bruto - f431_vlr_dscto_linea - f431_vlr_dscto_global AS v431_vlr_subtotal_ped_local,
              f431_vlr_imp                                                AS v431_vlr_imp_ped_local,
              f431_vlr_neto                                               AS v431_vlr_neto_ped_local,
              f431_vlr_imp_margen                                         AS v431_vlr_imp_margen_ped_local,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_bruto_pen_local,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_dscto_pen_local,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_subtotal_pen_local,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_pen_local,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)
              + ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                      * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_neto_pen_local,
              ROUND((CASE WHEN f431_cant_remisionada_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base END)
                    * (f431_vlr_imp_margen / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_margen_pen_local,
              ROUND(f431_cant_comprometida_base * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_bruto_com_local,
              ROUND(f431_cant_comprometida_base * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_dscto_com_local,
              ROUND(f431_cant_comprometida_base * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND(f431_cant_comprometida_base * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
                                                                          AS v431_vlr_subtotal_com_local,
              ROUND(f431_cant_comprometida_base * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_com_local,
              ROUND(f431_cant_comprometida_base * (f431_vlr_neto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_neto_com_local,
              ROUND(f431_cant_comprometida_base * (f431_vlr_imp_margen / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_margen_com_local,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_bruto_x_com_local,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_dscto_x_com_local,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_subtotal_x_com_local,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_x_com_local,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_bruto / NULLIF(f431_cant_pedida_base, 0)), t430.f_dec_docto)
              - ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                      * ((f431_vlr_dscto_linea + f431_vlr_dscto_global) / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)
              + ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                            ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                      * (f431_vlr_imp / NULLIF(f431_cant_pedida_base, 0)),
                      t430.f_dec_docto)                                   AS v431_vlr_neto_x_com_local,
              ROUND((CASE WHEN f431_cant_comprometida_base > f431_cant_pedida_base THEN 0
                          ELSE f431_cant_pedida_base - f431_cant_remisionada_base - f431_cant_comprometida_base END)
                    * (f431_vlr_imp_margen / NULLIF(f431_cant_pedida_base, 0)),
                    t430.f_dec_docto)                                     AS v431_vlr_imp_margen_x_com_loc

          FROM   t431_cm_pv_movto
          INNER  JOIN t430_meta t430
                  ON  t430.f_rowid_docto         = f431_rowid_pv_docto
          WHERE  f431_id_cia                     = @p_cia
            AND  f431_ind_estado                <> 9   -- no anulados
            AND  f431_ind_estado                <> 4   -- no cumplidos
      )

      SELECT
          clientefact.f200_razon_social                                   AS f_cliente_fact_razon_soc,
          clientefact.f200_nit,
          RTRIM(t430_docto.f430_id_tipo_docto) + '-'
              + dbo.lpad(t430_docto.f430_consec_docto, 8, '0')           AS f_nrodocto,

          CASE t430_docto.f430_ind_estado
              WHEN 0 THEN 'En elaboración'
              WHEN 1 THEN 'Retenido'
              WHEN 2 THEN 'Aprobado'
              WHEN 3 THEN CASE f1_comp_parcial
                              WHEN 31 THEN 'Comprometido parcial'
                              ELSE         'Comprometido'
                          END
              WHEN 4 THEN 'Cumplido'
              WHEN 9 THEN 'Anulado'
          END                                                             AS f_estado_docto,

          t430_docto.f430_fecha_ts_creacion                               AS f_fecha_creacion_docto,

          v431_fecha_entrega                                              AS f_fecha_entrega,

          t430_docto.f430_num_docto_referencia                            AS f_orden_compra,

          f120_id                                                         AS f_item,

          RTRIM(f120_referencia)                                          AS f_referencia,

          RTRIM(f120_descripcion)                                         AS f_desc_item,

          CONVERT(DECIMAL(28,2), v431_cant_pedida_base)                   AS f_cant_pedida_base,

          ISNULL(
              ROUND(v400_cant_existencia_1   / ISNULL(v431_factor, 1), 4)
            - ROUND(v400_cant_salida_sin_conf_1 / ISNULL(v431_factor, 1), 4)
            - ROUND(v400_cant_comprometida_1  / ISNULL(v431_factor, 1), 4),
          0)                                                              AS f_cant_disponible_ins,

          CONVERT(DECIMAL(28,2), v431_cant_remisionada_base)              AS f_cant_remision_base,

          CONVERT(DECIMAL(28,2), v431_cant_pendiente_base)                AS f_cant_pendiente_base,

          CONVERT(DECIMAL(28,2),
              CASE WHEN f100_id_unidad_peso IS NOT NULL THEN
                  CASE WHEN f120_id_unidad_adicional IS NOT NULL THEN
                      CASE WHEN f120_id_unidad_adicional = f100_id_unidad_peso
                                AND t122_inv.f122_peso = 0
                           THEN v431_cant2_pendiente
                           ELSE v431_cant1_pendiente * t122_inv.f122_peso
                      END
                  ELSE v431_cant1_pendiente * t122_inv.f122_peso
                  END
              ELSE 0
              END
          )                                                               AS f_peso_pendiente,

          CONVERT(DECIMAL(28,2),
              CASE WHEN f100_id_unidad_volumen IS NOT NULL THEN
                  CASE WHEN f120_id_unidad_adicional IS NOT NULL THEN
                      CASE WHEN f120_id_unidad_adicional = f100_id_unidad_volumen
                                AND t122_inv.f122_volumen = 0
                           THEN v431_cant2_pendiente
                           ELSE v431_cant1_pendiente * t122_inv.f122_volumen
                      END
                  ELSE v431_cant1_pendiente * t122_inv.f122_volumen
                  END
              ELSE 0
              END
          )                                                               AS f_vol_pendiente,

          f013_descripcion                                                AS f_desc_ciudad,

          v431_precio_unitario_base                                       AS f_precio_unit_docto,

          CAST(
              CASE WHEN t122_inv.f122_peso = 0 THEN 0
                   ELSE ROUND(v431_precio_unitario_base / t122_inv.f122_peso, 4)
              END
          AS DECIMAL(28,4))                                               AS f_precio_peso,

          t01_003.v125_descripcion                                        AS f_01_003,

          CONVERT(DECIMAL(28,2),
              CASE WHEN v431_cant_remisionada_base > v431_cant_pedida_base
                        OR v431_ind_estado = 4
                   THEN 0
                   ELSE v431_vlr_subtotal_pen_docto
              END
          )                                                               AS f_vlr_pendiente_subtotal,

          CONVERT(DECIMAL(28,2),
              CASE WHEN v431_cant_remisionada_base > v431_cant_pedida_base
                        OR v431_ind_estado = 4
                   THEN 0
                   ELSE v431_vlr_neto_pen_docto
              END
          )                                                               AS f_vlr_pendiente_pedido,

          f419_direccion1                                                 AS f_direccion1,

          vendedor.f200_razon_social                                      AS f_vendedor_razon_social,

          v431_vlr_neto_ped_docto                                         AS f_valor_neto_docto,

          v431_vlr_bruto_ped_local                                        AS f_valor_bruto_local,

          CONVERT(DECIMAL(28,2),
              CASE WHEN f100_id_unidad_peso IS NOT NULL THEN
                  CASE WHEN f120_id_unidad_adicional IS NOT NULL THEN
                      CASE WHEN f120_id_unidad_adicional = f100_id_unidad_peso
                                AND t122_inv.f122_peso = 0
                           THEN v431_cant2_pedida
                           ELSE v431_cant1_pedida * t122_inv.f122_peso
                      END
                  ELSE v431_cant1_pedida * t122_inv.f122_peso
                  END
              ELSE 0
              END
          )                                                               AS f_peso_pedida,

          ISNULL(t02_CDV.v207_descripcion, ' ')                           AS f_02_CDV,

          dbo.f_remover_enter_consulta(v431_notas)                        AS f_notas_movto,

          v431_vlr_subtotal_ped_local + v431_vlr_imp_margen_ped_local     AS f_divisor_margen_prom,
          v431_rowid_pv_docto                                             AS f_rowid_pv_docto,
          t430_docto.f430_rowid                                          AS f_rowid,
          t430_docto.f430_id_clase_docto                                  AS f_id_clase_docto,
          v431_vlr_subtotal_ped_local + v431_vlr_imp_margen_ped_local     AS f_divisor_margen_est,
          t430_docto.f430_consec_docto                                    AS f_numero,
          -- f_utilidad_prom_f
          CAST(
              (v431_vlr_subtotal_ped_local + v431_vlr_imp_margen_ped_local)
            - (v431_cant1_pedida * ISNULL(f132_costo_prom_uni, 0))
          AS DECIMAL(28,4))                                               AS f_utilidad_prom_f,
          v431_rowid                                                      AS f_rowid_movto

      FROM  v431

      INNER JOIN t431_cm_pv_movto              x
              ON  x.f431_rowid               = v431_rowid

      INNER JOIN t430_cm_pv_docto              t430_docto
              ON  t430_docto.f430_rowid      = v431_rowid_pv_docto

      INNER JOIN t028_mm_clases_documento
              ON  t430_docto.f430_id_clase_docto = f028_id
              AND f028_id_grupo_clase_docto  = 502

      INNER JOIN t100_pp_comerciales
              ON  f100_id_cia                = v431_id_cia

      INNER JOIN t150_mc_bodegas               t150
              ON  t150.f150_rowid            = v431_rowid_bodega

      INNER JOIN t101_mc_unidades_medida       t101_um
              ON  t101_um.f101_id_cia        = v431_id_cia
              AND t101_um.f101_id            = v431_id_unidad_medida

      INNER JOIN t121_mc_items_extensiones
              ON  f121_rowid                 = v431_rowid_item_ext

      INNER JOIN t120_mc_items
              ON  f120_rowid                 = f121_rowid_item

      INNER JOIN t122_mc_items_unidades        t122_um
              ON  t122_um.f122_id_cia        = f120_id_cia
              AND t122_um.f122_id_unidad     = x.f431_id_unidad_medida
              AND t122_um.f122_rowid_item    = f120_rowid

      INNER JOIN t122_mc_items_unidades        t122_inv
              ON  t122_inv.f122_id_cia       = f120_id_cia
              AND t122_inv.f122_id_unidad    = f120_id_unidad_inventario
              AND t122_inv.f122_rowid_item   = f120_rowid

      INNER JOIN t200_mm_terceros              clientefact
              ON  clientefact.f200_rowid     = t430_docto.f430_rowid_tercero_fact

      INNER JOIN t200_mm_terceros              clientedesp
              ON  clientedesp.f200_rowid     = t430_docto.f430_rowid_tercero_rem

      INNER JOIN t201_mm_clientes              succlientedesp
              ON  succlientedesp.f201_id_cia            = t430_docto.f430_id_cia
              AND succlientedesp.f201_rowid_tercero     = t430_docto.f430_rowid_tercero_rem
              AND succlientedesp.f201_id_sucursal       = t430_docto.f430_id_sucursal_rem

      INNER JOIN t200_mm_terceros              vendedor
              ON  vendedor.f200_rowid        = t430_docto.f430_rowid_tercero_vendedor

      INNER JOIN t215_mm_puntos_envio_cliente  t215_pv
              ON  t215_pv.f215_rowid         = t430_docto.f430_rowid_punto_envio_rem

      INNER JOIN t419_mc_contactos_docto
              ON  f419_rowid                 = t430_docto.f430_rowid_contacto_docto_rem

      INNER JOIN t013_mm_ciudades
              ON  f013_id_pais               = f419_id_pais
              AND f013_id_depto              = f419_id_depto
              AND f013_id                    = f419_id_ciudad

      LEFT  OUTER JOIN t132_mc_items_instalacion
              ON  f132_rowid_item_ext        = v431_rowid_item_ext
              AND f132_id_instalacion        = t150.f150_id_instalacion

      INNER JOIN (
          SELECT
              f430_rowid                                                  AS f1_rowid_pv_docto,
              MAX(CASE WHEN (f430_ind_estado = 3
                             AND (v431_ind_estado = 2
                                  OR (v431_ind_estado = 3
                                      AND (v431_cant1_pedida - v431_cant1_remisionada)
                                           <> v431_cant1_comprometida)))
                       THEN 31
                  END)                                                    AS f1_comp_parcial
          FROM   v431
          INNER  JOIN t430_cm_pv_docto t430_docto
                  ON  t430_docto.f430_rowid = v431_rowid_pv_docto
          WHERE  t430_docto.f430_id_cia    = @p_cia
            AND  v431_ind_estado           <> 9
            AND  v431_ind_estado           <> 4
            AND  t430_docto.f430_id_fecha  BETWEEN @p_fec_inicial AND @p_fec_final
          GROUP  BY f430_rowid
      )                                        t431b
              ON  f1_rowid_pv_docto          = v431_rowid_pv_docto

      LEFT  JOIN (
          SELECT
              f400_id_cia                                                 AS v400_id_cia,
              f400_rowid_item_ext                                         AS v400_rowid_item_ext,
              f400_id_instalacion                                         AS v400_id_instalacion,
              SUM(f400_cant_existencia_1)                                 AS v400_cant_existencia_1,
              SUM(f400_cant_salida_sin_conf_1)                            AS v400_cant_salida_sin_conf_1,
              SUM(f400_cant_comprometida_1)                               AS v400_cant_comprometida_1,
              SUM(f400_cant_pendiente_entrar_1)                           AS v400_cant_pendiente_entrar_1
          FROM   t400_cm_existencia
          INNER  JOIN t121_mc_items_extensiones
                  ON  f121_rowid             = f400_rowid_item_ext
          INNER  JOIN t120_mc_items
                  ON  f120_rowid             = f121_rowid_item
          INNER  JOIN t132_mc_items_instalacion
                  ON  f132_rowid_item_ext    = f400_rowid_item_ext
                  AND f132_id_instalacion    = f400_id_instalacion
          INNER  JOIN t150_mc_bodegas t150
                  ON  t150.f150_rowid        = f400_rowid_bodega
          WHERE  f400_id_cia                 = @p_cia
            AND  f120_id_tipo_inv_serv       = @p_tipo_inv
          GROUP  BY f400_id_cia, f400_rowid_item_ext, f400_id_instalacion
      )                                        v400
              ON  v400_rowid_item_ext        = v431_rowid_item_ext
              AND v400_id_instalacion        = f150_id_instalacion

      LEFT  JOIN v125                          t01_003
              ON  t01_003.v125_rowid_item    = f121_rowid_item
              AND t01_003.v125_id_plan       = '003'

      LEFT  JOIN v207                          t02_CDV
              ON  t02_CDV.v207_rowid_tercero = t430_docto.f430_rowid_tercero_rem
              AND t02_CDV.v207_id_sucursal   = t430_docto.f430_id_sucursal_rem
              AND t02_CDV.v207_id_plan_criterios = 'CDV'

      WHERE  t430_docto.f430_id_cia          = @p_cia
        AND  v431_ind_estado                <> 9    -- no anulados
        AND  v431_ind_estado                <> 4    -- no cumplidos
        --AND  f120_id_tipo_inv_serv           = @p_tipo_inv    -- tipo inventario '3'
        AND  t430_docto.f430_id_fecha  BETWEEN @p_fec_inicial AND @p_fec_final  -- últimos 5 años
        AND clientefact.f200_nit = @p_nit
      ORDER  BY
          t430_docto.f430_id_fecha,
          f_nrodocto,
          f120_id
      `,
      [nit],
    );

    return rows.map((r: any) => ({
      clienteRazonSocial: r.f_cliente_fact_razon_soc,
      nit: r.f200_nit,
      numeroDocumento: r.f_nrodocto,
      estado: r.f_estado_docto,
      fechaCreacion: r.f_fecha_creacion_docto,
      fechaEntrega: r.f_fecha_entrega,
      ordenCompra: r.f_orden_compra,
      item: r.f_item,
      referencia: r.f_referencia,
      descripcionItem: r.f_desc_item,
      cantidadPedida: r.f_cant_pedida_base,
      cantidadDisponibleInsumo: r.f_cant_disponible_ins,
      cantidadRemisionada: r.f_cant_remision_base,
      cantidadPendiente: r.f_cant_pendiente_base,
      pesoPendiente: r.f_peso_pendiente,
      volumenPendiente: r.f_vol_pendiente,
      ciudad: r.f_desc_ciudad,
      precioUnitario: r.f_precio_unit_docto,
      precioPeso: r.f_precio_peso,
      plan003: r.f_01_003,
      valorPendienteSubtotal: r.f_vlr_pendiente_subtotal,
      valorPendiente: r.f_vlr_pendiente_pedido,
      direccion: r.f_direccion1,
      vendedor: r.f_vendedor_razon_social,
      valorNeto: r.f_valor_neto_docto,
      valorBrutoLocal: r.f_valor_bruto_local,
      pesoPedida: r.f_peso_pedida,
      cdv: r.f_02_CDV,
      notas: r.f_notas_movto,
      numero: r.f_numero,
    }));
    // Nota: se excluyen a propósito f_divisor_margen_prom, f_divisor_margen_est,
    // f_utilidad_prom_f (cálculos internos de margen/utilidad — no deben
    // exponerse al cliente) y f_rowid_pv_docto/f_rowid/f_rowid_movto (llaves
    // internas de SIESA sin valor para el cliente).
    */

    // ────────────────────────────────────────────────────────────────────
    // Datos quemados temporales (fila real de ejemplo devuelta por la
    // consulta anterior contra SIESA, NIT 800092967) mientras no hay
    // acceso a SIESA. Borrar este bloque al descomentar el de arriba.
    // ────────────────────────────────────────────────────────────────────
    return [
      {
        clienteRazonSocial: 'INDUSTRIAS CARTON',
        nit: '800099999',
        numeroDocumento: 'PV-00259993',
        estado: 'Aprobado',
        fechaCreacion: '2021-07-21T09:13:25.000Z',
        fechaEntrega: '2021-08-11T00:00:00.000Z',
        ordenCompra: '19078',
        item: 421103,
        referencia: 'BAR00002571571',
        descripcionItem: '09568  CAJA CJ 3550',
        cantidadPedida: 985.0,
        cantidadDisponibleInsumo: 0.0,
        cantidadRemisionada: 505.0,
        cantidadPendiente: 480.0,
        pesoPendiente: 293.28,
        volumenPendiente: 603.36,
        ciudad: 'SIBERIA',
        precioUnitario: 2409.0,
        precioPeso: 3942.7169,
        plan003: '3 - PROPIO',
        valorPendienteSubtotal: 1156320.0,
        valorPendiente: 1376021.0,
        direccion: 'KM 1.5 VIA R',
        vendedor: 'DAVID LANCHEROS',
        valorNeto: 2823709.0,
        valorBrutoLocal: 2372865.0,
        pesoPedida: 601.84,
        cdv: null,
        notas: null,
        numero: 259993,
      },
    ];
  }
}
