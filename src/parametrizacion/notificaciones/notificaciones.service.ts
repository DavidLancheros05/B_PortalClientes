import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

type PlantillaSeed = {
  codigo: string;
  nombre: string;
  asunto: string;
  cuerpo_html: string;
  activa: boolean;
};

const DEFAULT_PLANTILLAS: PlantillaSeed[] = [
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
      '<p>Hola {{nombre}},</p><p>Tu cuenta fue creada correctamente.</p><p><b>Portal:</b> <a href="{{portal_url}}">{{portal_url}}</a></p><p><b>Usuario:</b> {{usuario_email}}</p><p><b>Contrasena:</b> {{usuario_password}}</p><p>Te recomendamos cambiar tu contrasena al iniciar sesion.</p>',
    activa: true,
  },
  {
    codigo: 'CARTA_VINCULACION_APROBADA_CLIENTE',
    nombre: 'Carta de Vinculación Aprobada - Cliente',
    asunto: 'Carta de Vinculación Comercial - Solicitud {{numero_solicitud}}',
    cuerpo_html:
      '<p>Estimado {{cliente_nombre}},</p><p>Le adjuntamos la <b>Carta de Vinculación Comercial</b> correspondiente a su solicitud <b>{{numero_solicitud}}</b>, que ha sido aprobada.</p><p><b>Condiciones Aprobadas:</b></p><ul><li><b>Cupo Aprobado:</b> {{cupo_aprobado}}</li><li><b>Plazo de Pago:</b> {{plazo_pago}}</li><li><b>Forma de Pago:</b> {{forma_pago}}</li></ul><p>Cordialmente,</p><p><b>CARTONERA CN</b><br/>Equipo de Vinculación Comercial</p>',
    activa: true,
  },
];

@Injectable()
export class NotificacionesService {
  constructor(private readonly dataSource: DataSource) {}

  async ensurePlantillasTableAndSeed() {
    await this.dataSource.query(`
      IF OBJECT_ID('dbo.Param_formato_correos_enviar', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Param_formato_correos_enviar (
          forc_plantilla_id INT IDENTITY(1,1) PRIMARY KEY,
          forc_codigo_evento VARCHAR(80) NOT NULL UNIQUE,
          forc_nombre VARCHAR(150) NOT NULL,
          forc_asunto VARCHAR(255) NOT NULL,
          forc_cuerpo_html NVARCHAR(MAX) NOT NULL,
          forc_destinatarios_to NVARCHAR(MAX) NULL,
          forc_destinatarios_cc NVARCHAR(MAX) NULL,
          forc_activa BIT NOT NULL DEFAULT 1,
          forc_updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END
    `);

    for (const plantilla of DEFAULT_PLANTILLAS) {
      await this.dataSource.query(
        `
          IF NOT EXISTS (
            SELECT 1 FROM dbo.Param_formato_correos_enviar WHERE forc_codigo_evento = @0
          )
          BEGIN
            INSERT INTO dbo.Param_formato_correos_enviar
            (forc_codigo_evento, forc_nombre, forc_asunto, forc_cuerpo_html, forc_activa)
            VALUES (@0, @1, @2, @3, @4)
          END
        `,
        [
          plantilla.codigo,
          plantilla.nombre,
          plantilla.asunto,
          plantilla.cuerpo_html,
          plantilla.activa ? 1 : 0,
        ],
      );
    }
  }

  async obtenerPlantillas() {
    await this.ensurePlantillasTableAndSeed();

    const result = await this.dataSource.query(`
      SELECT
        forc_plantilla_id as plantilla_id,
        forc_codigo_evento as codigo_evento,
        forc_nombre as nombre,
        forc_asunto as asunto,
        forc_cuerpo_html as cuerpo_html,
        forc_destinatarios_to as destinatarios_to,
        forc_destinatarios_cc as destinatarios_cc,
        forc_activa as activa,
        forc_updated_at as updated_at
      FROM dbo.Param_formato_correos_enviar
      ORDER BY forc_codigo_evento
    `);

    return result || [];
  }

  async crearOActualizarPlantilla(codigo: string, data: any) {
    const nombre = String(data?.nombre || codigo || '').trim();
    const asunto = String(data?.asunto || '').trim();
    const cuerpoHtml = String(data?.cuerpo_html || '');
    const destinatariosTo = String(data?.destinatarios_to || '').trim();
    const destinatariosCc = String(data?.destinatarios_cc || '').trim();
    const activa = Boolean(data?.activa);

    await this.dataSource.query(
      `
        IF NOT EXISTS (SELECT 1 FROM dbo.Param_formato_correos_enviar WHERE forc_codigo_evento = @0)
        BEGIN
          INSERT INTO dbo.Param_formato_correos_enviar
          (forc_codigo_evento, forc_nombre, forc_asunto, forc_cuerpo_html, forc_destinatarios_to, forc_destinatarios_cc, forc_activa)
          VALUES (@0, @1, @2, @3, @4, @5, @6)
        END
        ELSE
        BEGIN
          UPDATE dbo.Param_formato_correos_enviar
          SET
            forc_nombre = @1,
            forc_asunto = @2,
            forc_cuerpo_html = @3,
            forc_destinatarios_to = @4,
            forc_destinatarios_cc = @5,
            forc_activa = @6,
            forc_updated_at = SYSDATETIME()
          WHERE forc_codigo_evento = @0
        END
      `,
      [
        codigo,
        nombre,
        asunto,
        cuerpoHtml,
        destinatariosTo,
        destinatariosCc,
        activa ? 1 : 0,
      ],
    );

    const updated = await this.dataSource.query(
      `
        SELECT TOP 1
          forc_plantilla_id as plantilla_id,
          forc_codigo_evento as codigo_evento,
          forc_nombre as nombre,
          forc_asunto as asunto,
          forc_cuerpo_html as cuerpo_html,
          forc_destinatarios_to as destinatarios_to,
          forc_destinatarios_cc as destinatarios_cc,
          forc_activa as activa,
          forc_updated_at as updated_at
        FROM dbo.Param_formato_correos_enviar
        WHERE forc_codigo_evento = @0
      `,
      [codigo],
    );

    return updated?.[0] || null;
  }
}
