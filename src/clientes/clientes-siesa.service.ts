import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FormularioRenderizableService } from '../solicitudes/formulario-renderizable.service';

// Arma (sin enviar — no existe conexión real a SIESA hoy, ver
// Documentos Cartonera/documentacion/Portal Clientes/SIESA/
// plan-envio-solicitud-aprobada-a-siesa.md) una vista previa del EXEC que
// se llamaría contra SP_Clientes_Insertar, con los datos reales de la
// última solicitud aprobada del cliente. Los parámetros que hoy no tienen
// una fuente confiable en el portal (sin `fp_codigo` estable en el
// formulario, o sin decidir si son constantes de negocio) quedan marcados
// con un comentario en vez de inventar un valor.
@Injectable()
export class ClientesSiesaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly formularioRenderizableService: FormularioRenderizableService,
  ) {}

  async generarPreviewSiesa(
    cliId: number,
  ): Promise<{ sql: string; camposFaltantes: string[] }> {
    const [cliente] = await this.dataSource.query(
      `SELECT cli_id, cli_razon_social, cli_nro_identificacion, cli_direccion, cli_correo
       FROM dbo.Clientes WHERE cli_id = @0`,
      [cliId],
    );
    if (!cliente) {
      throw new BadRequestException('Cliente no existe');
    }

    const [solicitud] = await this.dataSource.query(
      `SELECT TOP 1 sol_id, sol_cupo_aprobado
       FROM dbo.solicitudes
       WHERE sol_cliente_id = @0 AND sol_estado_id = 5
       ORDER BY sol_fecha_aprobacion DESC, sol_id DESC`,
      [cliId],
    );
    if (!solicitud) {
      throw new BadRequestException(
        'Este cliente no tiene ninguna solicitud aprobada todavía — no hay de dónde tomar los datos.',
      );
    }

    const formulario = await this.formularioRenderizableService.obtenerFormularioRenderizable(
      solicitud.sol_id,
    );

    const porCodigo = (codigo: string) =>
      formulario.preguntas.find((p) => p.fp_codigo === codigo);

    const razonSocial =
      porCodigo('RAZON_SOCIAL')?.valor_resuelto || cliente.cli_razon_social;
    const nit = porCodigo('NIT')?.valor_resuelto || cliente.cli_nro_identificacion;
    const condicionPago = porCodigo('FORMA_PAGO_SOLICITADA')?.valor_resuelto;

    const repLegal = porCodigo('REP_LEGAL_TABLA');
    const primeraFilaRepLegal = repLegal?.tabla_filas?.[0];
    const contacto =
      primeraFilaRepLegal?.['Apellidos y Nombre'] || primeraFilaRepLegal?.['Nombre'];

    const camposFaltantes: string[] = [];
    const marcar = (nombre: string, valor: string | number | null | undefined) => {
      if (valor === null || valor === undefined || valor === '') {
        camposFaltantes.push(nombre);
        return `NULL /* FALTA: sin pregunta con ancla estable en el formulario */`;
      }
      return typeof valor === 'number' ? String(valor) : `N'${String(valor).replace(/'/g, "''")}'`;
    };

    const sql = `USE [SistemaComercial]
GO

DECLARE @return_value int

EXEC @return_value = [dbo].[SP_Clientes_Insertar]
    @id_cia = 4, /* PENDIENTE: confirmar si es constante para todo cliente */
    @contacto = ${marcar('contacto', contacto)},
    @direccion1 = ${marcar('direccion1', cliente.cli_direccion)},
    @telefono = NULL /* FALTA: Clientes no tiene columna de teléfono */,
    @email = ${marcar('email', cliente.cli_correo)},
    @p_celular = NULL /* FALTA: Clientes no tiene columna de celular */,
    @nit = ${marcar('nit', nit)},
    @dv_nit = NULL /* PENDIENTE: confirmar si el NIT ya viene con dígito de verificación separado */,
    @tipo_ident = 'N', /* PENDIENTE: validar con David */
    @tipo_tercero = 2, /* PENDIENTE: 1 natural / 2 jurídico, confirmar cómo se decide */
    @razon_social = ${marcar('razon_social', razonSocial)},
    @ciiu = NULL /* FALTA: sin pregunta con ancla estable en el formulario */,
    @p_cli_sucursal = '001', /* PENDIENTE: validar con Sibo */
    @p_cli_descripcion_sucursal = ${marcar('razon_social', razonSocial)}, /* PENDIENTE: validar con Sibo */
    @p_cli_id_moneda = 'COP',
    @p_cli_id_vendedor = NULL /* PENDIENTE: validar con Sibo — código del ejecutivo en SIESA */,
    @p_cli_rowid_contacto = NULL /* PENDIENTE: sin resolver para un cliente nuevo, ver plan-envio-solicitud-aprobada-a-siesa.md */,
    @p_cli_id_cond_pago = ${marcar('condicion_pago', condicionPago)},
    @p_cli_cupo_credito = ${marcar('cupo_credito', solicitud.sol_cupo_aprobado)},
    @p_cli_tipo = '0001', /* PENDIENTE: validar con Sibo */
    @p_id_lista_precio = '005', /* PENDIENTE: validar con Sibo */
    @p_porc_exceso_venta = 5, /* PENDIENTE: validar con Sibo */
    @p_porc_min_margen = 0, /* PENDIENTE: validar con Sibo */
    @p_porc_max_margen = 100, /* PENDIENTE: validar con Sibo */
    @p_cli_ind_calificacion = 'A' /* PENDIENTE: validar con Sibo */

SELECT 'Return Value' = @return_value
GO`;

    return { sql, camposFaltantes };
  }
}
