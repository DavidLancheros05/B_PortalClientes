import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { NotificacionesService } from './notificaciones.service';

@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get('plantillas')
  async listarPlantillas() {
    return this.notificacionesService.listarPlantillas();
  }

  @Put('plantillas/:codigo')
  async actualizarPlantilla(
    @Param('codigo') codigo: string,
    @Body()
    body: {
      nombre?: string;
      asunto?: string;
      cuerpo_html?: string;
      destinatarios_to?: string;
      destinatarios_cc?: string;
      activa?: boolean;
    },
  ) {
    return this.notificacionesService.actualizarPlantilla(codigo, body);
  }

  @Post('alertas-documentos/procesar')
  async procesarAlertaDocumentos(@Query('forzar') forzar?: string) {
    return this.notificacionesService.procesarAlertaSemanalDocumentos(
      forzar === '1' || forzar === 'true',
    );
  }

  @Post('condiciones/:solicitudId/enviar')
  async enviarCondiciones(
    @Param('solicitudId') solicitudId: number,
    @Body()
    body: {
      condicionesHtml: string;
    },
  ) {
    return this.notificacionesService.notificarCondicionesFinancieras(
      Number(solicitudId),
      body.condicionesHtml,
    );
  }

  @Post('usuarios/credenciales/enviar')
  async enviarCredencialesUsuario(
    @Body()
    body: {
      nombre: string;
      usuario_email: string;
      usuario_password: string;
      portal_url: string;
    },
  ) {
    return this.notificacionesService.notificarCredencialesUsuario(body);
  }
}
