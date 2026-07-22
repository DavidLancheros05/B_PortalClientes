import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { ExistenciaClienteResponseDto } from './dto/existencia-cliente.response.dto';

@Injectable()
export class ExistenciasService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  async getExistenciasPorCliente(
    cliId: number,
  ): Promise<ExistenciaClienteResponseDto[]> {
    const cliente = await this.clienteRepo.findOne({ where: { cli_id: cliId } });
    const nit = cliente?.cli_nro_identificacion;

    // ────────────────────────────────────────────────────────────────────
    // Pendiente: acceso real a SIESA (ver
    // documentacion/plan-migracion-clientes-siesa.md), igual que en
    // pedidos/remisiones/facturas.service.ts. Consulta va contra la BD de
    // SIESA, no contra la BD del portal — necesita su propia conexión
    // (`mssql`/DataSource aparte), distinta de `this.clienteRepo` de
    // arriba. Cuando exista esa conexión, descomentar este bloque,
    // reemplazar `siesaDataSource` por la instancia real, y borrar el
    // bloque de datos quemados de abajo.
    //
    // Origen: "4. Existencia a la fecha por bodega.sql" (aportada por el
    // usuario el 2026-07-21). El original es un reporte de inventario de
    // toda la compañía, sin filtro de cliente (cada ítem pertenece a un
    // tercero-cliente vía `t120.f120_rowid_tercero_cli`, modelo de
    // maquila). Se agregó `AND cli.f200_nit = @p_nit` (y el parámetro
    // @p_nit) para acotarlo a los ítems de un solo cliente, mismo criterio
    // usado en pedidos/remisiones/facturas.
    // ────────────────────────────────────────────────────────────────────
    /*
    const rows = await siesaDataSource.query(
      `
      DECLARE @p_cia            SMALLINT  = 2
      DECLARE @p_tipo_inv       CHAR(10)  = '3'
      DECLARE @p_saldos         SMALLINT  = 1      -- 1 = existencia <> 0
      DECLARE @p_ind_disponible SMALLINT  = 1      -- 1 = disponible <> 0
      DECLARE @p_permiso_costos SMALLINT  = 1
      DECLARE @p_empaque        SMALLINT  = 0      -- 0 = unidad inventario → @v_factor = 1
      DECLARE @p_detallar       SMALLINT  = 1      -- 1 = detalle lote/ubicación
      DECLARE @p_ind_ubica_inac SMALLINT  = 0      -- 0 = oculta ubicaciones inactivas sin existencia
      DECLARE @p_bdg            INT       = 0      -- 0 = todas las bodegas
      DECLARE @p_grupo          CHAR(3)   = ''
      DECLARE @p_instalacion    CHAR(3)   = ''
      DECLARE @p_ubicacion      CHAR(10)  = NULL
      DECLARE @p_lote           CHAR(15)  = NULL
      DECLARE @p_rowid_item     INT       = 0      -- 0 = todos los ítems
      DECLARE @p_fecha          DATETIME  = NULL
      DECLARE @p_nit            VARCHAR(20) = @0

      DECLARE @v_fecha   DATETIME = ISNULL(@p_fecha, CAST(GETDATE() AS DATE))
      DECLARE @v_factor  VARCHAR(20) = '1'         -- @p_empaque=0 → factor=1

      SELECT

          dbo.lpad(t120.f120_id, 7, '0')                              AS f_item,

          rtrim(t120.f120_referencia)                                 AS f_referencia,

          rtrim(t120.f120_descripcion)                                AS f_desc_item,

          ISNULL(cli.f200_razon_social, '')                           AS f_cliente,

          v400.v400_id_lote                                           AS f_id_lote,

          ROUND(v400.v400_cant_existencia_1 / 1.0, 4)                AS f_cant_existencia_1,

          CASE
              WHEN f100.f100_id_unidad_peso IS NOT NULL THEN
                  CASE
                      WHEN t120.f120_id_unidad_adicional IS NOT NULL THEN
                          CASE
                              WHEN t120.f120_id_unidad_adicional = f100.f100_id_unidad_peso
                                   AND t122.f122_peso = 0
                              THEN ROUND(v400.v400_cant_existencia_2, 4)
                              ELSE ROUND(t122.f122_peso * ROUND(v400.v400_cant_existencia_1 / 1.0, 4), 4)
                          END
                      ELSE ROUND(t122.f122_peso * ROUND(v400.v400_cant_existencia_1 / 1.0, 4), 4)
                  END
              ELSE 0
          END                                                         AS f_peso,

          t403.f403_fecha_creacion                                    AS f_fecha_lote,

          v400.v400_fecha_ult_entrada                                 AS f_fecha_ultima_entrada,

          v400.v400_id_ubicacion_aux                                  AS f_id_ubicacion_aux,

          t150.f150_id                                                AS f_bodega,

          CASE
              WHEN f100.f100_id_unidad_volumen IS NOT NULL THEN
                  CASE
                      WHEN t120.f120_id_unidad_adicional IS NOT NULL THEN
                          CASE
                              WHEN t120.f120_id_unidad_adicional = f100.f100_id_unidad_volumen
                                   AND t122.f122_volumen = 0
                              THEN ROUND(v400.v400_cant_existencia_2, 4)
                              ELSE ROUND(t122.f122_volumen * ROUND(v400.v400_cant_existencia_1 / 1.0, 4), 4)
                          END
                      ELSE ROUND(t122.f122_volumen * ROUND(v400.v400_cant_existencia_1 / 1.0, 4), 4)
                  END
              ELSE 0
          END                                                         AS f_volumen,

          ISNULL(ejec.f200_razon_social, '')                          AS f_ejecutivo_negocio,

          CASE WHEN @p_permiso_costos = 0 THEN 0
               ELSE v400.v400_costo_prom_tot
          END                                                         AS f_costo_prom_tot,

          t150.f150_id_co                                             AS f_co_bodega,

          v400.v400_cant_existencia_1
              - v400.v400_cant_salida_sin_conf_1
              - v400.v400_cant_comprometida_1                         AS f_cant_disponible,
          v400.v400_cant_existencia_1                                 AS f_cant_existencia,
          v400.v400_rowid_item_ext                                    AS f_rowid_item_ext,
          t121.f121_rowid_item                                        AS f_rowid_item_cri,
          v400.v400_rowid_bodega                                      AS f_rowid_bodega,
          v400.v400_origen                                            AS f_origen,
          t120.f120_ind_tipo_item                                     AS f_ind_tipo_item

      FROM (

          SELECT
              401                                                                 AS v400_origen,
              f400.f400_id_cia                                                    AS v400_id_cia,
              f400.f400_rowid_item_ext                                            AS v400_rowid_item_ext,
              f400.f400_rowid_bodega                                              AS v400_rowid_bodega,
              ISNULL(f401.f401_id_ubicacion_aux, f400.f400_id_ubicacion_aux)      AS v400_id_ubicacion_aux,
              ISNULL(f401.f401_id_lote, '')                                       AS v400_id_lote,
              f400.f400_id_instalacion                                            AS v400_id_instalacion,

              ISNULL(f401.f401_costo_prom_tot, f400.f400_costo_prom_tot)          AS v400_costo_prom_tot,
              ISNULL(f401.f401_costo_prom_uni, f400.f400_costo_prom_uni)          AS v400_costo_prom_uni,

              ISNULL(f401.f401_cant_existencia_1,    f400.f400_cant_existencia_1)     AS v400_cant_existencia_1,
              ISNULL(f401.f401_cant_salida_sin_conf_1, f400.f400_cant_salida_sin_conf_1) AS v400_cant_salida_sin_conf_1,
              ISNULL(f401.f401_cant_comprometida_1,  f400.f400_cant_comprometida_1)   AS v400_cant_comprometida_1,

              ISNULL(f401.f401_cant_existencia_2,    f400.f400_cant_existencia_2)     AS v400_cant_existencia_2,
              ISNULL(f401.f401_cant_salida_sin_conf_2, f400.f400_cant_salida_sin_conf_2) AS v400_cant_salida_sin_conf_2,
              ISNULL(f401.f401_cant_comprometida_2,  f400.f400_cant_comprometida_2)   AS v400_cant_comprometida_2,

              ISNULL(f401.f401_fecha_ult_entrada, f400.f400_fecha_ult_entrada)        AS v400_fecha_ult_entrada,
              ISNULL(f401.f401_fecha_ult_salida,  f400.f400_fecha_ult_salida)         AS v400_fecha_ult_salida,

              f400.f400_abc_rotacion_costo        AS v400_abc_rotacion_costo,
              f400.f400_abc_rotacion_veces        AS v400_abc_rotacion_veces,
              f400.f400_categoria_ciclo_conteo    AS v400_categoria_ciclo_conteo,
              f400.f400_fecha_ult_conteo          AS v400_fecha_ult_conteo,
              f400.f400_fecha_ult_compra          AS v400_fecha_ult_compra,
              f400.f400_fecha_ult_venta           AS v400_fecha_ult_venta,
              f400.f400_consumo_promedio          AS v400_consumo_promedio,
              ISNULL(f401.f401_cant_pos_1, f400.f400_cant_pos_1) AS v400_cant_pos_1,
              ISNULL(f401.f401_cant_pos_2, f400.f400_cant_pos_2) AS v400_cant_pos_2,
              f400.f400_cant_nivel_min_1          AS v400_cant_nivel_min_1,
              f400.f400_cant_nivel_max_1          AS v400_cant_nivel_max_1,
              f400.f400_cant_nivel_pedido         AS v400_cant_nivel_pedido,
              t150b.f150_id_co                    AS v400_id_co_bodega
          FROM  t400_cm_existencia            f400

          INNER JOIN t150_mc_bodegas          t150b
                 ON  t150b.f150_rowid         = f400.f400_rowid_bodega

          INNER JOIN t121_mc_items_extensiones t121f
                 ON  t121f.f121_rowid         = f400.f400_rowid_item_ext
          INNER JOIN t120_mc_items            t120f
                 ON  t120f.f120_rowid         = t121f.f121_rowid_item

          LEFT  JOIN t401_cm_existencia_lote  f401
                 ON  f401.f401_rowid_item_ext = f400.f400_rowid_item_ext
                 AND f401.f401_rowid_bodega   = f400.f400_rowid_bodega

          LEFT  JOIN t155_mc_ubicacion_auxiliares t155_u1
                 ON  t155_u1.f155_rowid_bodega = f401.f401_rowid_bodega
                 AND t155_u1.f155_id           = f401.f401_id_ubicacion_aux
          WHERE
              f400.f400_id_cia                = @p_cia
              AND t120f.f120_id_tipo_inv_serv = @p_tipo_inv

              AND f400.f400_cant_existencia_1 <> 0

              AND ROUND(f400.f400_cant_existencia_1
                        - f400.f400_cant_salida_sin_conf_1
                        - f400.f400_cant_comprometida_1, 4) <> 0

              AND (
                    f401.f401_id_ubicacion_aux IS NULL
                 OR ISNULL(f401.f401_cant_existencia_1, 0) <> 0
                 OR t155_u1.f155_ind_estado = 1
              )

              AND (@p_bdg        = 0    OR f400.f400_rowid_bodega   = @p_bdg)
              AND (@p_instalacion = ''  OR f400.f400_id_instalacion = @p_instalacion)
              AND (@p_rowid_item  = 0   OR t121f.f121_rowid_item    = @p_rowid_item)
              AND (@p_ubicacion IS NULL OR f401.f401_id_ubicacion_aux = @p_ubicacion)
              AND (@p_lote      IS NULL OR f401.f401_id_lote          = @p_lote)
      ) v400

      INNER JOIN t121_mc_items_extensiones    t121
              ON  t121.f121_rowid             = v400.v400_rowid_item_ext

      INNER JOIN t120_mc_items                t120
              ON  t120.f120_rowid             = t121.f121_rowid_item

      INNER JOIN t122_mc_items_unidades       t122
              ON  t122.f122_rowid_item        = t120.f120_rowid
              AND t122.f122_id_unidad         = t120.f120_id_unidad_inventario  -- @v_um_factor con @p_empaque=0
      LEFT  JOIN t122_mc_items_unidades       t_adic
              ON  t_adic.f122_id_cia          = t120.f120_id_cia
              AND t_adic.f122_id_unidad       = t120.f120_id_unidad_adicional
              AND t_adic.f122_rowid_item      = t120.f120_rowid
      INNER JOIN t100_pp_comerciales          f100
              ON  f100.f100_id_cia            = v400.v400_id_cia

      INNER JOIN t150_mc_bodegas              t150
              ON  t150.f150_rowid             = v400.v400_rowid_bodega

      LEFT  JOIN t200_mm_terceros             cli
              ON  cli.f200_rowid              = t120.f120_rowid_tercero_cli

      LEFT  JOIN t201_mm_clientes             t201
              ON  t201.f201_rowid_tercero     = t120.f120_rowid_tercero_cli
              AND t201.f201_id_cia            = @p_cia
              AND t201.f201_id_sucursal       = '001'   -- sucursal principal; ajustar si hay varias
      LEFT  JOIN t210_mm_vendedores           t210
              ON  t210.f210_id                = t201.f201_id_vendedor
              AND t210.f210_id_cia            = @p_cia
      LEFT  JOIN t200_mm_terceros             ejec
              ON  ejec.f200_rowid             = t210.f210_rowid_tercero

      LEFT  JOIN t403_cm_lotes                t403
              ON  t403.f403_id_cia            = v400.v400_id_cia
              AND t403.f403_id                = v400.v400_id_lote
              AND t403.f403_rowid_item_ext    = v400.v400_rowid_item_ext

      WHERE
          v400.v400_id_cia                    = @p_cia
          AND t120.f120_id_tipo_inv_serv      = @p_tipo_inv
          -- Saldo con factor=1
          AND ROUND(v400.v400_cant_existencia_1 / 1.0, 4) <> 0
          -- Disponible con factor=1
          AND ROUND(v400.v400_cant_existencia_1 / 1.0, 4)
              - ROUND(v400.v400_cant_salida_sin_conf_1 / 1.0, 4)
              - ROUND(v400.v400_cant_comprometida_1   / 1.0, 4) <> 0
          AND (@p_ubicacion IS NULL OR v400.v400_id_ubicacion_aux = @p_ubicacion)
          AND (@p_lote      IS NULL OR v400.v400_id_lote          = @p_lote)
          AND cli.f200_nit                    = @p_nit

      ORDER BY
          dbo.lpad(t120.f120_id, 7, '0'),     -- f_item
          v400.v400_id_lote,                   -- f_id_lote
          t150.f150_id,                        -- f_bodega
          v400.v400_id_ubicacion_aux           -- f_id_ubicacion_aux
      `,
      [nit],
    );

    return rows.map((r: any) => ({
      item: r.f_item,
      referencia: r.f_referencia,
      descripcionItem: r.f_desc_item,
      cliente: r.f_cliente,
      lote: r.f_id_lote,
      cantidadExistencia: r.f_cant_existencia_1,
      cantidadDisponible: r.f_cant_disponible,
      peso: r.f_peso,
      volumen: r.f_volumen,
      fechaLote: r.f_fecha_lote,
      fechaUltimaEntrada: r.f_fecha_ultima_entrada,
      ubicacion: r.f_id_ubicacion_aux,
      bodega: r.f_bodega,
      ejecutivoNegocio: r.f_ejecutivo_negocio,
    }));
    // Nota: se excluyen a propósito f_costo_prom_tot (costo interno, gated
    // por @p_permiso_costos — dato financiero interno, no para el
    // cliente), f_co_bodega (código interno de centro de operación),
    // f_cant_existencia (duplicado de f_cant_existencia_1 con factor=1),
    // f_rowid_item_ext/f_rowid_item_cri/f_rowid_bodega (llaves internas de
    // SIESA) y f_origen/f_ind_tipo_item (banderas/clasificaciones internas
    // sin mapeo a texto amigable) — no deben exponerse al cliente.
    */

    // ────────────────────────────────────────────────────────────────────
    // Datos quemados temporales mientras no hay acceso a SIESA. Borrar
    // este bloque al descomentar el de arriba.
    // ────────────────────────────────────────────────────────────────────
    return [
      {
        item: '0421103',
        referencia: 'BAR00002571571',
        descripcionItem: '09568  CAJA CJ 3550',
        cliente: 'INDUSTRIAS CARTON',
        lote: 'L-230721',
        cantidadExistencia: 1200.0,
        cantidadDisponible: 850.0,
        peso: 715.32,
        volumen: 1472.4,
        fechaLote: '2026-07-10T00:00:00.000Z',
        fechaUltimaEntrada: '2026-07-18T00:00:00.000Z',
        ubicacion: 'A-01-03',
        bodega: '01',
        ejecutivoNegocio: 'DAVID LANCHEROS',
      },
    ];
  }
}
