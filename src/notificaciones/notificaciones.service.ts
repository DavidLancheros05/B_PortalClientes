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
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{cliente_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tu solicitud quedo registrada correctamente y esta pendiente de revision.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Centro de Operacion</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{centro_operacion_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Fecha</p><p style="margin:0 0 0;color:#003d99;font-size:15px;font-weight:bold;">{{fecha_creacion}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Ver mi solicitud</a></td></tr></table><p style="margin:16px 0 0;color:#8a94a6;font-size:12px;line-height:1.5;">{{mensaje_cambios}}</p></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_REGISTRADA_EJECUTIVO',
        nombre: 'Solicitud registrada - Ejecutivo de Negocios',
        asunto:
          'Nueva solicitud pendiente de {{cliente_nombre}}: {{numero_solicitud}}',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{ejecutivo_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tienes una nueva solicitud pendiente de revisar:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{cliente_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Centro de Operacion</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{centro_operacion_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Fecha</p><p style="margin:0 0 0;color:#003d99;font-size:15px;font-weight:bold;">{{fecha_creacion}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Revisar solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_ESTADO_CLIENTE',
        nombre: 'Cambio de estado - Cliente',
        asunto: 'Actualización de tu solicitud {{numero_solicitud}}',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{cliente_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tu solicitud <b>{{numero_solicitud}}</b> fue <b>{{estado_solicitud}}</b>.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Detalle</p><p style="margin:0 0 0;color:#003d99;font-size:15px;font-weight:bold;">{{detalle_estado}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Ver mi solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_RECHAZADA_CLIENTE',
        nombre: 'Solicitud rechazada - Cliente',
        asunto: 'Solicitud {{numero_solicitud}} - Requiere corrección de documentos',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{cliente_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tu solicitud <b>{{numero_solicitud}}</b> fue rechazada y requiere corrección de documentos.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Motivo</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{motivo_rechazo}}</p></td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff7ed;border-radius:8px;border:1px solid #fed7aa;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 8px;color:#9a5b1e;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Documentos a corregir</p>{{documentos_html}}</td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Corregir solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_RECHAZADA_DEFINITIVA_CLIENTE',
        nombre: 'Solicitud rechazada definitivamente - Cliente',
        asunto: 'Solicitud {{numero_solicitud}} - Rechazada',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{cliente_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tu solicitud <b>{{numero_solicitud}}</b> fue rechazada. Este proceso queda cerrado.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Motivo</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{motivo_rechazo}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Ver mi solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'DOCUMENTOS_VENCIDOS_SEMANAL',
        nombre: 'Alerta semanal documentos vencidos',
        asunto: 'Alerta semanal de documentos - {{fecha_reporte}}',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Alerta semanal de documentos</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Resumen de documentos vencidos y por vencer al <b>{{fecha_reporte}}</b>.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td width="48%" style="padding:16px 18px;background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca;"><p style="margin:0 0 4px;color:#9f1239;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Vencidos</p><p style="margin:0;color:#b91c1c;font-size:24px;font-weight:bold;">{{total_vencidos}}</p></td><td width="4%">&nbsp;</td><td width="48%" style="padding:16px 18px;background-color:#fff7ed;border-radius:8px;border:1px solid #fed7aa;"><p style="margin:0 0 4px;color:#9a5b1e;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Por vencer (7 dias)</p><p style="margin:0;color:#c2620a;font-size:24px;font-weight:bold;">{{total_por_vencer}}</p></td></tr></table><div style="overflow-x:auto;">{{tabla_resumen}}</div></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'CONDICIONES_FINANCIERAS_CLIENTE',
        nombre: 'Condiciones financieras al cliente',
        asunto: 'Condiciones financieras aprobadas - {{numero_solicitud}}',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{cliente_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Te adjuntamos en PDF las condiciones financieras aprobadas para tu solicitud.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Ver mi solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'USUARIO_CREADO_CREDENCIALES',
        nombre: 'Usuario creado - Credenciales de acceso',
        asunto: 'Bienvenido al Portal de Clientes - Cartonera Nacional S.A.',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{usuario_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tu cuenta en el Portal de Clientes fue creada correctamente. Ya podes ingresar con las siguientes credenciales:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Usuario</p><p style="margin:0 0 14px;color:#003d99;font-size:16px;font-weight:bold;">{{usuario_login}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Contrasena</p><p style="margin:0 0 14px;color:#003d99;font-size:16px;font-weight:bold;">{{usuario_password}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Correo</p><p style="margin:0;color:#374151;font-size:13px;">{{usuario_email}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Ingresar al portal</a></td></tr></table><p style="margin:0;color:#8a94a6;font-size:12px;line-height:1.5;">Por seguridad, te recomendamos cambiar tu contrasena despues de tu primer ingreso.</p></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_PENDIENTE_ASC',
        nombre: 'Solicitud pendiente - Auxiliar Servicio Cliente',
        asunto: 'Solicitud {{numero_solicitud}} pendiente de tu revisión',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{usuario_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tienes una nueva solicitud pendiente de revisar como Auxiliar de Servicio al Cliente:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{cliente_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Centro de Operacion</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{centro_operacion_nombre}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Revisar solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_PENDIENTE_OC',
        nombre: 'Solicitud pendiente - Oficial de Cumplimiento',
        asunto: 'Solicitud {{numero_solicitud}} pendiente de tu revisión',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{usuario_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tienes una nueva solicitud pendiente de revisar como Oficial de Cumplimiento:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{cliente_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Centro de Operacion</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{centro_operacion_nombre}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Revisar solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_PENDIENTE_CC1',
        nombre: 'Solicitud pendiente - Comité de Crédito 1',
        asunto: 'Solicitud {{numero_solicitud}} pendiente de tu revisión',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{usuario_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tienes una nueva solicitud pendiente de revisar en el Comité de Crédito 1:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{cliente_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Centro de Operacion</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{centro_operacion_nombre}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Revisar solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'SOLICITUD_PENDIENTE_CC2',
        nombre: 'Solicitud pendiente - Comité de Crédito 2',
        asunto: 'Solicitud {{numero_solicitud}} pendiente de tu revisión',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Portal de Clientes</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Hola <b>{{usuario_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Tienes una nueva solicitud pendiente de revisar en el Comité de Crédito 2:</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">No. Solicitud</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{numero_solicitud}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{cliente_nombre}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Centro de Operacion</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{centro_operacion_nombre}}</p></td></tr></table><table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 4px;"><tr><td style="border-radius:8px;background-color:#0052cc;"><a href="{{portal_url}}" style="display:inline-block;padding:12px 36px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Revisar solicitud</a></td></tr></table></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
        activa: true,
      },
      {
        codigo: 'CARTA_VINCULACION_APROBADA_CLIENTE',
        nombre: 'Carta de Vinculación Aprobada - Cliente',
        asunto: 'Carta de Vinculación Comercial - Solicitud {{numero_solicitud}}',
        cuerpo_html:
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;"><tr><td style="background-color:#003d99;padding:28px 32px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:19px;font-weight:bold;letter-spacing:0.5px;">CARTONERA NACIONAL S.A.</p><p style="margin:6px 0 0;color:#a9c2f0;font-size:13px;">Vinculación Comercial</p></td></tr><tr><td style="padding:32px;"><p style="margin:0 0 16px;color:#1f2937;font-size:15px;">Estimado <b>{{cliente_nombre}}</b>,</p><p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.6;">Adjuntamos la <b>Carta de Vinculación Comercial</b> correspondiente a tu solicitud <b>{{numero_solicitud}}</b>, que fue aprobada.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef4ff;border-radius:8px;border:1px solid #d6e4ff;margin-bottom:24px;"><tr><td style="padding:18px 20px;"><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Cupo aprobado</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{cupo_aprobado}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Plazo de pago</p><p style="margin:0 0 14px;color:#003d99;font-size:15px;font-weight:bold;">{{plazo_pago}}</p><p style="margin:0 0 4px;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Forma de pago</p><p style="margin:0;color:#003d99;font-size:15px;font-weight:bold;">{{forma_pago}}</p></td></tr></table><p style="margin:0;color:#8a94a6;font-size:12px;line-height:1.5;">Cordialmente,<br/>Equipo de Vinculación Comercial</p></td></tr><tr><td style="background-color:#f9fafc;padding:16px 32px;text-align:center;border-top:1px solid #eef1f6;"><p style="margin:0;color:#9aa4b5;font-size:11px;">Este es un mensaje automatico, por favor no respondas a este correo.</p></td></tr></table></td></tr></table>',
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
        c.cli_correo AS cliente_email,
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
      portal_url: process.env.PORTAL_CLIENTES_URL || '',
    };

    if (solicitud.cliente_email) {
      await this.enviarConPlantilla('SOLICITUD_REGISTRADA_CLIENTE', variables, [
        String(solicitud.cliente_email),
      ]);
    }

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

  // Usuarios activos (usr_estado = 'A') con correo, para un rol dado
  // (rol_codigo en pc_roles: ASC, OC, CC1, CC2, COMERCIAL, etc). A diferencia
  // del Ejecutivo de Negocios (asignado 1 a 1 por solicitud vía
  // sol_ejecutivo_id), estos roles funcionan como bandeja compartida: puede
  // haber 0, 1 o varios usuarios activos con el mismo rol, y cada uno recibe
  // su propio correo personalizado (no un solo correo con varios "to").
  private async obtenerUsuariosActivosPorRol(
    rolCodigo: string,
  ): Promise<Array<{ email: string; nombre: string }>> {
    const rows = await this.dataSource.query(
      `
      SELECT DISTINCT u.usr_correo AS email, u.usr_nombre AS nombre
      FROM Usuarios u
      JOIN pc_usuario_rol ur ON ur.ur_usuario_id = u.usr_id AND ur.ur_activo = 1
      JOIN pc_roles r ON r.rol_id = ur.ur_rol_id
      WHERE r.rol_codigo = @0
        AND u.usr_estado = 'A'
        AND u.usr_correo IS NOT NULL AND u.usr_correo <> ''
      `,
      [rolCodigo],
    );

    return rows.map((r: any) => ({
      email: String(r.email),
      nombre: r.nombre ? String(r.nombre) : 'Usuario',
    }));
  }

  // Notifica a TODOS los usuarios activos de un rol (ASC, OC, CC1, CC2) que
  // una solicitud quedó pendiente de su revisión, un correo individual por
  // usuario (cada uno a su propia dirección). Se llama justo después de que
  // la etapa anterior aprueba y la solicitud pasa a la bandeja de este rol.
  async notificarSolicitudPendienteAlRol(
    solicitudId: number,
    rolCodigo: string,
    codigoEvento: string,
  ) {
    const solicitud = await this.getSolicitudData(solicitudId);
    if (!solicitud) return { ok: false, mensaje: 'Solicitud no encontrada' };

    const destinatarios = await this.obtenerUsuariosActivosPorRol(rolCodigo);
    if (destinatarios.length === 0) {
      this.logger.warn(
        `Sin usuarios activos con correo para el rol ${rolCodigo} (solicitud ${solicitudId})`,
      );
      return { ok: true, enviados: 0, total: 0 };
    }

    let enviados = 0;
    for (const destinatario of destinatarios) {
      const variables = {
        usuario_nombre: destinatario.nombre,
        numero_solicitud: solicitud.numero_solicitud,
        cliente_nombre: solicitud.cliente_nombre || 'Cliente',
        centro_operacion_nombre: solicitud.centro_operacion_nombre || '-',
        portal_url: process.env.PORTAL_CLIENTES_URL || '',
      };

      const resultado = await this.enviarConPlantilla(codigoEvento, variables, [
        destinatario.email,
      ]);
      if (resultado.sent) enviados++;
    }

    return { ok: true, enviados, total: destinatarios.length };
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
        u.usr_correo AS ejecutivo_email,
        u.usr_nombre AS ejecutivo_nombre
      FROM solicitudes s
      LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id
      LEFT JOIN Centro_operacion co ON co.cop_id = s.sol_co_id
      LEFT JOIN usuarios u ON u.ejng_id = s.sol_ejecutivo_id
      LEFT JOIN pc_usuario_rol ur ON ur.ur_usuario_id = u.usr_id AND ur.ur_activo = 1
      LEFT JOIN pc_roles r ON r.rol_id = ur.ur_rol_id AND r.rol_nombre = 'EJECUTIVO'
      WHERE s.sol_id = @0 AND r.rol_id IS NOT NULL
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
      portal_url: process.env.PORTAL_CLIENTES_URL || '',
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
      portal_url: process.env.PORTAL_CLIENTES_URL || '',
    };

    return this.enviarConPlantilla('SOLICITUD_ESTADO_CLIENTE', variables, [
      String(solicitud.cliente_email),
    ]);
  }

  async notificarRechazoSolicitud(
    solicitudId: number,
    motivoDescripcion: string | null,
    documentosFaltantesNombres: string[],
  ) {
    const solicitud = await this.getSolicitudData(solicitudId);
    if (!solicitud || !solicitud.cliente_email) {
      return { ok: false, mensaje: 'Solicitud o correo cliente no encontrado' };
    }

    const documentosHtml =
      documentosFaltantesNombres.length > 0
        ? `<ul style="margin:0;padding-left:18px;color:#7c4a12;font-size:13px;line-height:1.6;">${documentosFaltantesNombres.map((n) => `<li>${n}</li>`).join('')}</ul>`
        : '<p style="margin:0;color:#7c4a12;font-size:13px;">Revise los documentos e intente nuevamente.</p>';

    const variables = {
      numero_solicitud: solicitud.numero_solicitud,
      cliente_nombre: solicitud.cliente_nombre || 'Cliente',
      motivo_rechazo: motivoDescripcion || 'Corrija los documentos indicados',
      documentos_html: documentosHtml,
      portal_url: process.env.PORTAL_CLIENTES_URL || '',
    };

    return this.enviarConPlantilla('SOLICITUD_RECHAZADA_CLIENTE', variables, [
      String(solicitud.cliente_email),
    ]);
  }

  // Rechazo definitivo (OFC, CC1, CC2): a diferencia del rechazo de ASC, no
  // hay ruta de corrección ni reintento — plantilla distinta, sin la caja
  // de "documentos a corregir" ni el botón "Corregir solicitud".
  async notificarRechazoDefinitivoSolicitud(
    solicitudId: number,
    motivoDescripcion: string | null,
  ) {
    const solicitud = await this.getSolicitudData(solicitudId);
    if (!solicitud || !solicitud.cliente_email) {
      return { ok: false, mensaje: 'Solicitud o correo cliente no encontrado' };
    }

    const variables = {
      numero_solicitud: solicitud.numero_solicitud,
      cliente_nombre: solicitud.cliente_nombre || 'Cliente',
      motivo_rechazo: motivoDescripcion || 'No se indicó un motivo adicional',
      portal_url: process.env.PORTAL_CLIENTES_URL || '',
    };

    return this.enviarConPlantilla(
      'SOLICITUD_RECHAZADA_DEFINITIVA_CLIENTE',
      variables,
      [String(solicitud.cliente_email)],
    );
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
      portal_url: process.env.PORTAL_CLIENTES_URL || '',
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
        s.sol_numero_solicitud AS numero_solicitud,
        COALESCE(c.cli_razon_social, '-') AS cliente_nombre,
        sa.sa_nombre_original,
        sa.sa_fecha_vencimiento,
        CASE
          WHEN sa.sa_fecha_vencimiento < CAST(GETDATE() AS date) THEN 'VENCIDO'
          ELSE 'POR_VENCER'
        END AS estado
      FROM Solicitud_archivo sa
      INNER JOIN solicitudes s ON s.sol_id = sa.sa_sol_id
      LEFT JOIN clientes c ON c.cli_id = s.sol_cliente_id
      WHERE sa.sa_fecha_vencimiento IS NOT NULL
        AND sa.sa_estado = 'activo'
        AND (
          sa.sa_fecha_vencimiento < CAST(GETDATE() AS date)
          OR sa.sa_fecha_vencimiento <= DATEADD(day, 7, CAST(GETDATE() AS date))
        )
      ORDER BY sa.sa_fecha_vencimiento ASC
    `);

    const vencidos = rows.filter((r: any) => String(r.estado) === 'VENCIDO');
    const porVencer = rows.filter(
      (r: any) => String(r.estado) === 'POR_VENCER',
    );

    const celda =
      'padding:8px 10px;border-bottom:1px solid #eef1f6;color:#374151;font-size:12px;';
    const cabecera =
      'padding:8px 10px;text-align:left;color:#5b6b85;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;';

    const tabla = rows
      .slice(0, 100)
      .map((r: any) => {
        const colorEstado = r.estado === 'VENCIDO' ? '#b91c1c' : '#c2620a';
        return `<tr><td style="${celda}">${r.numero_solicitud}</td><td style="${celda}">${r.cliente_nombre}</td><td style="${celda}">${r.sa_nombre_original}</td><td style="${celda}">${r.sa_fecha_vencimiento}</td><td style="${celda}font-weight:bold;color:${colorEstado};">${r.estado}</td></tr>`;
      })
      .join('');

    await this.enviarConPlantilla('DOCUMENTOS_VENCIDOS_SEMANAL', {
      fecha_reporte: new Date().toISOString().slice(0, 10),
      total_vencidos: vencidos.length,
      total_por_vencer: porVencer.length,
      tabla_resumen: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr style="background-color:#eef4ff;"><th style="${cabecera}">Solicitud</th><th style="${cabecera}">Cliente</th><th style="${cabecera}">Documento</th><th style="${cabecera}">Vence</th><th style="${cabecera}">Estado</th></tr></thead><tbody>${tabla}</tbody></table>`,
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
    usuario_login: string;
    usuario_email: string;
    usuario_password: string;
    portal_url: string;
  }) {
    const email = String(payload.usuario_email || '').trim();
    if (!email) {
      return { ok: false, mensaje: 'Correo de usuario no proporcionado' };
    }

    const variables = {
      usuario_nombre: String(payload.nombre || 'Usuario').trim(),
      usuario_login: String(payload.usuario_login || '').trim(),
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
