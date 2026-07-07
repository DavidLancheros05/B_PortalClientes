import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailService } from '../mail/mail.service';

type PlantillaEvento = {
  codigo: string;
  nombre: string;
  asunto: string;
  cuerpo_html: string;
  destinatarios_to?: string;
  destinatarios_cc?: string;
  activa: boolean;
};

@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  private async ensurePlantillasTable() {
    await this.dataSource.query(`
      IF OBJECT_ID('dbo.Param_formato_correos_enviar', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Param_formato_correos_enviar (
          plantilla_id INT IDENTITY(1,1) PRIMARY KEY,
          codigo_evento VARCHAR(80) NOT NULL UNIQUE,
          nombre VARCHAR(150) NOT NULL,
          asunto VARCHAR(255) NOT NULL,
          cuerpo_html NVARCHAR(MAX) NOT NULL,
          destinatarios_to NVARCHAR(MAX) NULL,
          destinatarios_cc NVARCHAR(MAX) NULL,
          activa BIT NOT NULL DEFAULT 1,
          updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END
    `);

    const defaults: PlantillaEvento[] = [
      {
        codigo: 'SOLICITUD_REGISTRADA_CLIENTE',
        nombre: 'Solicitud registrada - Cliente',
        asunto: 'Solicitud {{numero_solicitud}} registrada',
        cuerpo_html:
          '<p>Hola {{cliente_nombre}},</p><p>Tu solicitud <b>{{numero_solicitud}}</b> quedó registrada con estado <b>Pendiente</b>.</p><p>Fecha: {{fecha_creacion}}</p>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_REGISTRADA_COMERCIAL',
        nombre: 'Solicitud registrada - Comercial',
        asunto: 'Nueva solicitud registrada: {{numero_solicitud}}',
        cuerpo_html:
          '<p>Se registró una nueva solicitud.</p><ul><li>No. solicitud: <b>{{numero_solicitud}}</b></li><li>Cliente: {{cliente_nombre}}</li><li>Centro: {{centro_operacion_nombre}}</li></ul><p>{{mensaje_cambios}}</p>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_REGISTRADA_EJECUTIVO',
        nombre: 'Solicitud registrada - Ejecutivo de Negocios',
        asunto:
          'Nueva solicitud pendiente de {{cliente_nombre}}: {{numero_solicitud}}',
        cuerpo_html:
          '<p>Hola {{ejecutivo_nombre}},</p><p>Tienes una nueva solicitud pendiente de revisar:</p><ul><li>No. solicitud: <b>{{numero_solicitud}}</b></li><li>Cliente: {{cliente_nombre}}</li><li>Centro: {{centro_operacion_nombre}}</li><li>Fecha: {{fecha_creacion}}</li></ul><p>Accede al portal para revisar los detalles y tomar acción.</p>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_ESTADO_CLIENTE',
        nombre: 'Cambio de estado - Cliente',
        asunto: 'Actualización de tu solicitud {{numero_solicitud}}',
        cuerpo_html:
          '<p>Hola {{cliente_nombre}},</p><p>Tu solicitud <b>{{numero_solicitud}}</b> fue <b>{{estado_solicitud}}</b>.</p><p>{{detalle_estado}}</p>',
        activa: true,
      },
      {
        codigo: 'DOCUMENTOS_VENCIDOS_SEMANAL',
        nombre: 'Alerta semanal documentos vencidos',
        asunto: 'Alerta semanal de documentos - {{fecha_reporte}}',
        cuerpo_html:
          '<p>Resumen semanal de documentos:</p><p><b>Vencidos:</b> {{total_vencidos}}</p><p><b>Por vencer esta semana:</b> {{total_por_vencer}}</p><div>{{tabla_resumen}}</div>',
        activa: true,
      },
      {
        codigo: 'CONDICIONES_FINANCIERAS_CLIENTE',
        nombre: 'Condiciones financieras al cliente',
        asunto: 'Condiciones financieras aprobadas - {{numero_solicitud}}',
        cuerpo_html:
          '<p>Hola {{cliente_nombre}},</p><p>Adjuntamos PDF con las condiciones financieras aprobadas para la solicitud <b>{{numero_solicitud}}</b>.</p>',
        activa: true,
      },
      {
        codigo: 'USUARIO_CREADO_CREDENCIALES',
        nombre: 'Usuario creado - Credenciales de acceso',
        asunto: 'Acceso al portal de clientes',
        cuerpo_html:
          "<p>Hola {{nombre}},</p><p>Tu cuenta fue creada correctamente.</p><p><b>Portal:</b> <a href='{{portal_url}}'>{{portal_url}}</a></p><p><b>Usuario:</b> {{usuario_email}}</p><p><b>Contrasena:</b> {{usuario_password}}</p><p>Te recomendamos cambiar tu contrasena al iniciar sesion.</p>",
        activa: true,
      },
    ];

    for (const item of defaults) {
      await this.dataSource.query(
        `
          IF NOT EXISTS (
            SELECT 1 FROM dbo.Param_formato_correos_enviar WHERE codigo_evento = @0
          )
          BEGIN
            INSERT INTO dbo.Param_formato_correos_enviar
            (codigo_evento, nombre, asunto, cuerpo_html, activa)
            VALUES (@0, @1, @2, @3, @4)
          END
        `,
        [item.codigo, item.nombre, item.asunto, item.cuerpo_html, item.activa],
      );
    }
  }

  private renderTemplate(content: string, variables: Record<string, any>) {
    return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => {
      const value = variables[key];
      return value === null || value === undefined ? '' : String(value);
    });
  }

  private splitEmails(raw?: string | null): string[] {
    return String(raw || '')
      .split(/[;,]/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  private async getPlantilla(codigo: string): Promise<PlantillaEvento | null> {
    await this.ensurePlantillasTable();
    const rows = await this.dataSource.query(
      `
        SELECT
          codigo_evento,
          nombre,
          asunto,
          cuerpo_html,
          destinatarios_to,
          destinatarios_cc,
          activa
        FROM dbo.Param_formato_correos_enviar
        WHERE codigo_evento = @0
      `,
      [codigo],
    );

    const row = rows?.[0];
    if (!row) return null;
    return {
      codigo: String(row.codigo_evento),
      nombre: String(row.nombre),
      asunto: String(row.asunto),
      cuerpo_html: String(row.cuerpo_html),
      destinatarios_to: row.destinatarios_to
        ? String(row.destinatarios_to)
        : '',
      destinatarios_cc: row.destinatarios_cc
        ? String(row.destinatarios_cc)
        : '',
      activa: Boolean(row.activa),
    };
  }

  async listarPlantillas() {
    await this.ensurePlantillasTable();
    return this.dataSource.query(`
      SELECT
        plantilla_id,
        codigo_evento,
        nombre,
        asunto,
        cuerpo_html,
        destinatarios_to,
        destinatarios_cc,
        activa,
        updated_at
      FROM dbo.Param_formato_correos_enviar
      ORDER BY codigo_evento
    `);
  }

  async actualizarPlantilla(
    codigo: string,
    patch: {
      nombre?: string;
      asunto?: string;
      cuerpo_html?: string;
      destinatarios_to?: string;
      destinatarios_cc?: string;
      activa?: boolean;
    },
  ) {
    await this.ensurePlantillasTable();

    await this.dataSource.query(
      `
        IF NOT EXISTS (SELECT 1 FROM dbo.Param_formato_correos_enviar WHERE codigo_evento = @0)
        BEGIN
          INSERT INTO dbo.Param_formato_correos_enviar
          (codigo_evento, nombre, asunto, cuerpo_html, destinatarios_to, destinatarios_cc, activa)
          VALUES (@0, @1, @2, @3, @4, @5, @6)
        END
        ELSE
        BEGIN
          UPDATE dbo.Param_formato_correos_enviar
          SET
            nombre = @1,
            asunto = @2,
            cuerpo_html = @3,
            destinatarios_to = @4,
            destinatarios_cc = @5,
            activa = @6,
            updated_at = SYSDATETIME()
          WHERE codigo_evento = @0
        END
      `,
      [
        codigo,
        patch.nombre || codigo,
        patch.asunto || '',
        patch.cuerpo_html || '',
        patch.destinatarios_to || '',
        patch.destinatarios_cc || '',
        patch.activa ?? true,
      ],
    );

    return this.getPlantilla(codigo);
  }

  private async getSolicitudData(solicitudId: number) {
    const result = await this.dataSource.query(
      `
      SELECT TOP 1
        s.sol_id,
        s.sol_numero_solicitud AS numero_solicitud,
        s.sol_estado_id,
        s.sol_fecha_creacion AS fecha_creacion,
        c.cli_razon_social AS cliente_nombre,
        c.cli_email AS cliente_email,
        co.cop_nombre AS centro_operacion_nombre
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id
      LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
      WHERE s.sol_id = @0
      `,
      [solicitudId],
    );

    return result?.[0] || null;
  }

  private getEstadoLabel(estadoId: number) {
    if (estadoId === 1) return 'Pendiente';
    if (estadoId === 2) return 'Revisión Comercial';
    if (estadoId === 3) return 'Aprobada';
    if (estadoId === 4) return 'Rechazada';
    if (estadoId === 5) return 'Borrador';
    return 'Desconocido';
  }

  private async enviarConPlantilla(
    codigoEvento: string,
    variables: Record<string, any>,
    dynamicTo?: string[],
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }>,
  ) {
    const plantilla = await this.getPlantilla(codigoEvento);
    if (!plantilla || !plantilla.activa) {
      this.logger.warn(`Plantilla no activa/no encontrada: ${codigoEvento}`);
      return { sent: false, reason: 'Plantilla no activa o inexistente' };
    }

    const staticTo = this.splitEmails(plantilla.destinatarios_to);
    const to = Array.from(new Set([...(dynamicTo || []), ...staticTo])).filter(
      (item) => item,
    );
    const cc = this.splitEmails(plantilla.destinatarios_cc);

    if (to.length === 0) {
      this.logger.warn(`Sin destinatarios para evento ${codigoEvento}`);
      return { sent: false, reason: 'Sin destinatarios' };
    }

    const subject = this.renderTemplate(plantilla.asunto, variables);
    const html = this.renderTemplate(plantilla.cuerpo_html, variables);

    await this.mailService.enviarCorreo({
      to: to.join(','),
      cc: cc.length ? cc.join(',') : undefined,
      subject,
      html,
      attachments,
    });

    return { sent: true };
  }

  async notificarRegistroSolicitud(
    solicitudId: number,
    huboCambiosDatos: boolean = false,
  ) {
    const solicitud = await this.getSolicitudData(solicitudId);
    if (!solicitud) return { ok: false, mensaje: 'Solicitud no encontrada' };

    const variables = {
      numero_solicitud: solicitud.numero_solicitud,
      cliente_nombre: solicitud.cliente_nombre || 'Cliente',
      centro_operacion_nombre: solicitud.centro_operacion_nombre || '-',
      fecha_creacion: solicitud.fecha_creacion,
      mensaje_cambios: huboCambiosDatos
        ? 'Se detectaron cambios en los datos registrados para actualización.'
        : 'No se detectaron cambios en datos registrados.',
    };

    if (solicitud.cliente_email) {
      await this.enviarConPlantilla('SOLICITUD_REGISTRADA_CLIENTE', variables, [
        String(solicitud.cliente_email),
      ]);
    }

    await this.enviarConPlantilla('SOLICITUD_REGISTRADA_COMERCIAL', variables);

    // Notificar al ejecutivo de negocios del cliente
    try {
      await this.notificarSolicitudPendienteAlEjecutivo(solicitudId);
    } catch (error: any) {
      this.logger.warn(
        `Error al notificar ejecutivo para solicitud ${solicitudId}: ${error?.message}`,
      );
      // No interrumpir el flujo si falla la notificación al ejecutivo
    }

    return { ok: true };
  }

  async notificarSolicitudPendienteAlEjecutivo(solicitudId: number) {
    const result = await this.dataSource.query(
      `
      SELECT TOP 1
        s.sol_id,
        s.sol_numero_solicitud AS numero_solicitud,
        s.sol_fecha_creacion AS fecha_creacion,
        c.cli_razon_social AS cliente_nombre,
        co.cop_nombre AS centro_operacion_nombre,
        u.usr_email AS ejecutivo_email,
        u.usr_nombre AS ejecutivo_nombre
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id
      LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
      LEFT JOIN usuarios u ON u.usr_id = s.sol_ejecutivo_id
      WHERE s.sol_id = @0
      `,
      [solicitudId],
    );

    const solicitud = result?.[0];
    if (!solicitud || !solicitud.ejecutivo_email) {
      this.logger.debug(
        `No hay ejecutivo asignado para la solicitud ${solicitudId}`,
      );
      return { sent: false, reason: 'Sin ejecutivo asignado' };
    }

    const variables = {
      numero_solicitud: solicitud.numero_solicitud,
      cliente_nombre: solicitud.cliente_nombre || 'Cliente',
      centro_operacion_nombre: solicitud.centro_operacion_nombre || '-',
      fecha_creacion: solicitud.fecha_creacion,
      ejecutivo_nombre: solicitud.ejecutivo_nombre || 'Ejecutivo',
    };

    return this.enviarConPlantilla(
      'SOLICITUD_REGISTRADA_EJECUTIVO',
      variables,
      [String(solicitud.ejecutivo_email)],
    );
  }

  async notificarEstadoSolicitud(solicitudId: number, estadoId: number) {
    const solicitud = await this.getSolicitudData(solicitudId);
    if (!solicitud || !solicitud.cliente_email) {
      return { ok: false, mensaje: 'Solicitud o correo cliente no encontrado' };
    }

    const estado = this.getEstadoLabel(estadoId);
    const variables = {
      numero_solicitud: solicitud.numero_solicitud,
      cliente_nombre: solicitud.cliente_nombre || 'Cliente',
      estado_solicitud: estado,
      detalle_estado:
        estadoId === 3
          ? 'Tu solicitud fue aprobada.'
          : estadoId === 4
            ? 'Tu solicitud fue rechazada.'
            : `La solicitud cambió a estado ${estado}.`,
    };

    return this.enviarConPlantilla('SOLICITUD_ESTADO_CLIENTE', variables, [
      String(solicitud.cliente_email),
    ]);
  }

  private buildSimplePdf(content: string): Buffer {
    // Genera un PDF mínimo de una página con texto plano.
    const escapePdfText = (text: string) =>
      text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    const lines = content.split('\n').slice(0, 45);
    let y = 780;
    const textOps: string[] = ['BT', '/F1 11 Tf'];
    for (const line of lines) {
      textOps.push(`1 0 0 1 40 ${y} Tm (${escapePdfText(line)}) Tj`);
      y -= 16;
    }
    textOps.push('ET');

    const stream = textOps.join('\n');

    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
      '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${obj}\n`;
    }

    const xrefPos = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }

  async notificarCondicionesFinancieras(
    solicitudId: number,
    condicionesHtml: string,
  ) {
    const solicitud = await this.getSolicitudData(solicitudId);
    if (!solicitud || !solicitud.cliente_email) {
      return { ok: false, mensaje: 'Solicitud o correo cliente no encontrado' };
    }

    const textoPlano = condicionesHtml
      .replace(/<\/?(p|br|li|h[1-6]|ul|ol|div)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const pdfBuffer = this.buildSimplePdf(
      `Condiciones financieras aprobadas\nSolicitud: ${solicitud.numero_solicitud}\nCliente: ${solicitud.cliente_nombre || '-'}\n\n${textoPlano}`,
    );

    const variables = {
      numero_solicitud: solicitud.numero_solicitud,
      cliente_nombre: solicitud.cliente_nombre || 'Cliente',
    };

    await this.enviarConPlantilla(
      'CONDICIONES_FINANCIERAS_CLIENTE',
      variables,
      [String(solicitud.cliente_email)],
      [
        {
          filename: `condiciones-${solicitud.numero_solicitud}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    );

    return { ok: true };
  }

  async procesarAlertaSemanalDocumentos(forzar: boolean = false) {
    const hoy = new Date();
    const day = hoy.getDay(); // 1 = lunes
    if (!forzar && day !== 1) {
      return {
        ok: true,
        mensaje: 'Hoy no es lunes; no se procesa alerta semanal',
      };
    }

    const rows = await this.dataSource.query(`
      SELECT
        s.sol_numero_solicitud,
        COALESCE(c.cli_razon_social, '-') AS cliente_nombre,
        sa.nombre_original,
        sa.fecha_vencimiento,
        CASE
          WHEN sa.fecha_vencimiento < CAST(GETDATE() AS date) THEN 'VENCIDO'
          ELSE 'POR_VENCER'
        END AS estado
      FROM Solicitud_archivo sa
      INNER JOIN solicitudes s ON s.sol_id = sa.solicitud_id
      LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id
      WHERE sa.fecha_vencimiento IS NOT NULL
        AND sa.estado = 'activo'
        AND (
          sa.fecha_vencimiento < CAST(GETDATE() AS date)
          OR sa.fecha_vencimiento <= DATEADD(day, 7, CAST(GETDATE() AS date))
        )
      ORDER BY sa.fecha_vencimiento ASC
    `);

    const vencidos = rows.filter((r: any) => String(r.estado) === 'VENCIDO');
    const porVencer = rows.filter(
      (r: any) => String(r.estado) === 'POR_VENCER',
    );

    const tabla = rows
      .slice(0, 100)
      .map(
        (r: any) =>
          `<tr><td>${r.numero_solicitud}</td><td>${r.cliente_nombre}</td><td>${r.nombre_original}</td><td>${r.fecha_vencimiento}</td><td>${r.estado}</td></tr>`,
      )
      .join('');

    await this.enviarConPlantilla('DOCUMENTOS_VENCIDOS_SEMANAL', {
      fecha_reporte: new Date().toISOString().slice(0, 10),
      total_vencidos: vencidos.length,
      total_por_vencer: porVencer.length,
      tabla_resumen: `<table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Solicitud</th><th>Cliente</th><th>Documento</th><th>Vence</th><th>Estado</th></tr></thead><tbody>${tabla}</tbody></table>`,
    });

    return {
      ok: true,
      total: rows.length,
      vencidos: vencidos.length,
      por_vencer: porVencer.length,
    };
  }

  async notificarCredencialesUsuario(payload: {
    nombre: string;
    usuario_email: string;
    usuario_password: string;
    portal_url: string;
  }) {
    const email = String(payload.usuario_email || '').trim();
    if (!email) {
      return { ok: false, mensaje: 'Correo de usuario no proporcionado' };
    }

    const variables = {
      nombre: String(payload.nombre || 'Usuario').trim(),
      usuario_email: email,
      usuario_password: String(payload.usuario_password || ''),
      portal_url: String(payload.portal_url || '').trim(),
    };

    try {
      const result = await this.enviarConPlantilla(
        'USUARIO_CREADO_CREDENCIALES',
        variables,
        [email],
      );

      return {
        ok: !!result?.sent,
        ...result,
      };
    } catch (error: any) {
      const mensaje =
        String(error?.message || '').trim() ||
        'No se pudo enviar el correo de credenciales';

      this.logger.error(
        `[USUARIO_CREADO_CREDENCIALES] Error enviando credenciales: ${mensaje}`,
      );

      return {
        ok: false,
        sent: false,
        reason: 'error-envio',
        mensaje,
      };
    }
  }
}
