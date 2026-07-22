import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { SaldoClienteResponseDto } from './dto/saldo-cliente.response.dto';

@Injectable()
export class CarteraService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  async getSaldosPorCliente(cliId: number): Promise<SaldoClienteResponseDto[]> {
    const cliente = await this.clienteRepo.findOne({ where: { cli_id: cliId } });
    const nit = cliente?.cli_nro_identificacion;

    // ────────────────────────────────────────────────────────────────────
    // Pendiente: acceso real a SIESA (ver
    // documentacion/plan-migracion-clientes-siesa.md), igual que en
    // pedidos/remisiones/facturas/existencias.service.ts. Consulta va
    // contra la BD de SIESA, no contra la BD del portal — necesita su
    // propia conexión (`mssql`/DataSource aparte), distinta de
    // `this.clienteRepo` de arriba. Cuando exista esa conexión,
    // descomentar este bloque, reemplazar `siesaDataSource` por la
    // instancia real, y borrar el bloque de datos quemados de abajo.
    //
    // Origen: "5. Resumen de saldos de clientes.sql" (aportada por el
    // usuario el 2026-07-21). El original agrupa la cartera de TODOS los
    // clientes de la compañía, sin filtro por cliente. Se agregó
    // `AND ter.f200_nit = @p_nit` (y el parámetro @p_nit) para acotarlo a
    // un solo cliente, mismo criterio usado en
    // pedidos/remisiones/existencias.
    // ────────────────────────────────────────────────────────────────────
    /*
    const rows = await siesaDataSource.query(
      `
      DECLARE @Fecha_Calculo_Mora DATETIME = GETDATE();
      DECLARE @F_Inicio           DATETIME = DATEADD(year, -5, @Fecha_Calculo_Mora);
      DECLARE @F_Fin              DATETIME = @Fecha_Calculo_Mora;
      DECLARE @p_nit              VARCHAR(20) = @0;

      SELECT
          aux.f253_id AS [Auxiliar],

          ter.f200_id AS [Cliente],

          ter.f200_razon_social AS [Razon social sucursal],

          vend.f200_razon_social AS [Razon social vend. docto.],

          sa.f353_id_co_cruce AS [C.O.],

          FORMAT(MAX(cli.f201_cupo_credito), 'N2', 'en-US') AS [Cupo de credito],

          RTRIM(sa.f353_id_tipo_docto_cruce) + '-' + RIGHT('00000000' + CAST(sa.f353_consec_docto_cruce AS VARCHAR(20)), 8) AS [Nro. docto. cruce],

          CONVERT(VARCHAR(10), MAX(sa.f353_fecha_docto_cruce), 103) AS [Fecha docto.],

          CONVERT(VARCHAR(10), MAX(sa.f353_fecha_vcto), 103) AS [Fecha vcto.],

          DATEDIFF(day, MAX(sa.f353_fecha_docto_cruce), MAX(sa.f353_fecha_vcto)) AS [Plazo],

          CASE
              WHEN SUM(ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) < 0 THEN 0
              WHEN DATEDIFF(day, MAX(sa.f353_fecha_vcto), @Fecha_Calculo_Mora) < 0 THEN 0
              ELSE DATEDIFF(day, MAX(sa.f353_fecha_vcto), @Fecha_Calculo_Mora)
          END AS [Dias vencidos],

          FORMAT(SUM(CASE
                   WHEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) < 0
                   THEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0))
                   WHEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) > 0
                        AND DATEDIFF(day, sa.f353_fecha_vcto, @Fecha_Calculo_Mora) <= 0
                   THEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0))
                   ELSE 0
              END), 'N2', 'en-US') AS [Total corriente COP],

          FORMAT(SUM(CASE WHEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) > 0 AND DATEDIFF(day, sa.f353_fecha_vcto, @Fecha_Calculo_Mora) BETWEEN 1 AND 15
                   THEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) ELSE 0 END), 'N2', 'en-US') AS [Ven. 1 a 15 COP],

          FORMAT(SUM(CASE WHEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) > 0 AND DATEDIFF(day, sa.f353_fecha_vcto, @Fecha_Calculo_Mora) BETWEEN 16 AND 30
                   THEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) ELSE 0 END), 'N2', 'en-US') AS [Ven. 16 a 30 COP],

          FORMAT(SUM(CASE WHEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) > 0 AND DATEDIFF(day, sa.f353_fecha_vcto, @Fecha_Calculo_Mora) BETWEEN 31 AND 60
                   THEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) ELSE 0 END), 'N2', 'en-US') AS [Ven. 31 a 60 COP],

          FORMAT(SUM(CASE WHEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) > 0 AND DATEDIFF(day, sa.f353_fecha_vcto, @Fecha_Calculo_Mora) > 60
                   THEN (ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) ELSE 0 END), 'N2', 'en-US') AS [Ven. 61 a 9999 COP],

          FORMAT(SUM(ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)), 'N2', 'en-US') AS [Total COP]

      FROM
          t353_co_saldo_abierto sa
      INNER JOIN
          t200_mm_terceros ter ON sa.f353_rowid_tercero = ter.f200_rowid
      INNER JOIN
          t201_mm_clientes cli ON sa.f353_rowid_tercero = cli.f201_rowid_tercero AND sa.f353_id_sucursal = cli.f201_id_sucursal
      LEFT JOIN
          t200_mm_terceros vend ON sa.f353_rowid_vend = vend.f200_rowid
      LEFT JOIN
          t253_co_auxiliares aux ON sa.f353_rowid_auxiliar = aux.f253_rowid
      WHERE
          sa.f353_id_cia = 2
          AND sa.f353_fecha_docto_cruce BETWEEN @F_Inicio AND @F_Fin
          AND sa.f353_id_tipo_docto_cruce IS NOT NULL
          AND sa.f353_consec_docto_cruce <> 0
          AND (sa.f353_fecha_cancelacion IS NULL OR sa.f353_fecha_cancelacion > @Fecha_Calculo_Mora)
          AND ter.f200_nit = @p_nit
      GROUP BY
          aux.f253_id,
          ter.f200_id,
          ter.f200_razon_social,
          vend.f200_razon_social,
          sa.f353_id_co_cruce,
          sa.f353_id_tipo_docto_cruce,
          sa.f353_consec_docto_cruce
      HAVING
          SUM(ISNULL(sa.f353_total_db, 0) - ISNULL(sa.f353_total_cr, 0) + ISNULL(sa.f353_total_ch_postf, 0)) <> 0
      ORDER BY
          [Cliente], [Nro. docto. cruce]
      `,
      [nit],
    );

    return rows.map((r: any) => ({
      auxiliar: r['Auxiliar'],
      nit: r['Cliente'],
      razonSocialSucursal: r['Razon social sucursal'],
      vendedor: r['Razon social vend. docto.'],
      centroOperacion: r['C.O.'],
      cupoCredito: r['Cupo de credito'],
      numeroDocumento: r['Nro. docto. cruce'],
      fechaDocumento: r['Fecha docto.'],
      fechaVencimiento: r['Fecha vcto.'],
      plazo: r['Plazo'],
      diasVencidos: r['Dias vencidos'],
      totalCorriente: r['Total corriente COP'],
      vencido1a15: r['Ven. 1 a 15 COP'],
      vencido16a30: r['Ven. 16 a 30 COP'],
      vencido31a60: r['Ven. 31 a 60 COP'],
      vencidoMas60: r['Ven. 61 a 9999 COP'],
      total: r['Total COP'],
    }));
    */

    // ────────────────────────────────────────────────────────────────────
    // Datos quemados temporales mientras no hay acceso a SIESA. Borrar
    // este bloque al descomentar el de arriba.
    // ────────────────────────────────────────────────────────────────────
    return [
      {
        auxiliar: '130505',
        nit: '800099999',
        razonSocialSucursal: 'INDUSTRIAS CARTON',
        vendedor: 'DAVID LANCHEROS',
        centroOperacion: '001',
        cupoCredito: '127,500,000.00',
        numeroDocumento: 'FEV-00098211',
        fechaDocumento: '16/07/2026',
        fechaVencimiento: '15/08/2026',
        plazo: 30,
        diasVencidos: 0,
        totalCorriente: '1,447,609.00',
        vencido1a15: '0.00',
        vencido16a30: '0.00',
        vencido31a60: '0.00',
        vencidoMas60: '0.00',
        total: '1,447,609.00',
      },
    ];
  }
}
