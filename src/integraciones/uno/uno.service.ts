import { Injectable } from '@nestjs/common';
import { DatosIdentificacionClienteResponseDto } from './dto/datos-identificacion-cliente.response.dto';

@Injectable()
export class UnoService {
  async obtenerDatosIdentificacionPorNit(
    nit: string,
  ): Promise<DatosIdentificacionClienteResponseDto> {
    // ────────────────────────────────────────────────────────────────────
    // Pendiente: acceso real a SIESA (ver
    // documentacion/plan-migracion-clientes-siesa.md). Esta consulta va
    // contra la BD de SIESA — necesita su propia conexión (DataSource
    // aparte apuntando al servidor de SIESA), no existe hoy en este
    // backend. Cuando exista esa conexión, descomentar este bloque,
    // reemplazar `siesaDataSource` por la instancia real, y borrar el
    // bloque de datos quemados de abajo.
    //
    // Consulta verificada manualmente contra SIESA el 2026-07-21 (NIT de
    // prueba 800092967, ejecutada por el usuario fuera de esta app).
    // ────────────────────────────────────────────────────────────────────
    /*
    const rows = await siesaDataSource.query(
      `
      DECLARE @p_cia SMALLINT = 1
      DECLARE @p_nit VARCHAR(20) = @0

      SELECT
          t200.f200_rowid          AS f_rowid_tercero,
          t200.f200_nit             AS f_nit,
          t200.f200_razon_social    AS f_razon_social,
          t200.f200_id_cia          AS f_id_cia
      FROM t200_mm_terceros t200
      WHERE t200.f200_id_cia = @p_cia
        AND t200.f200_nit    = @p_nit
      `,
      [nit],
    );

    const r = rows[0];
    return {
      rowidTercero: r.f_rowid_tercero,
      nit: r.f_nit,
      razonSocial: r.f_razon_social,
      idCia: r.f_id_cia,
    };
    */

    // ────────────────────────────────────────────────────────────────────
    // Dato quemado temporal (fila real de ejemplo devuelta por la consulta
    // anterior contra SIESA, NIT 800092967) mientras no hay acceso a SIESA.
    // Borrar este bloque al descomentar el de arriba.
    // ────────────────────────────────────────────────────────────────────
    return {
      rowidTercero: 14858,
      nit: '800092967',
      razonSocial: 'INDUSTRIAS DONSSON SAS',
      idCia: 1,
    };
  }
}
