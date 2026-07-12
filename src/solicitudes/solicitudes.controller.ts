import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Put,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  Req,
  Res,
  HttpException,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { SolicitudesService } from './solicitudes.service';
import { SolicitudesListadosService } from './solicitudes-listados.service';
import { SolicitudesRespuestasService } from './solicitudes-respuestas.service';
import { SolicitudesWorkflowService } from './solicitudes-workflow.service';
import { SolicitudesDocumentosService } from './solicitudes-documentos.service';
import { FormularioRenderizableService } from './formulario-renderizable.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SolicitudRespuestaDto } from './dto/solicitud-respuesta.response.dto';
import { ParamDiasRespuestaResponseDto } from './dto/param-dias-respuesta.response.dto';
import { WorkflowEtapaResponseDto } from './dto/workflow-etapa.response.dto';
import { WorkflowResultadoResponseDto } from './dto/workflow-resultado.response.dto';
import { SolicitudListadoGestionDto } from './dto/solicitud-listado-gestion.response.dto';
import { SolicitudClienteDto } from './dto/solicitud-cliente.response.dto';
import { SolicitudPendienteDto } from './dto/solicitud-pendiente.response.dto';

@Controller('solicitudes')
export class SolicitudesController {
  constructor(
    private readonly solicitudesService: SolicitudesService,
    private readonly listadosService: SolicitudesListadosService,
    private readonly respuestasService: SolicitudesRespuestasService,
    private readonly workflowService: SolicitudesWorkflowService,
    private readonly documentosService: SolicitudesDocumentosService,
    private readonly formularioRenderizableService: FormularioRenderizableService,
  ) {
    console.log('🟣 [SOLICITUDES-CONTROLLER] ✅ Controlador inicializado');
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async crearSolicitud(@Body() dto: any) {
    try {
      console.log(
        '🔹 Body recibido del frontend:',
        JSON.stringify(dto, null, 2),
      );

      const cliente_id = dto.cliente_id;
      const co_id = dto.co_id;

      if (!cliente_id) {
        console.warn('❌ cliente_id está vacío o nulo:', cliente_id);
        throw new Error('cliente_id es obligatorio');
      }
      if (!co_id) {
        console.warn('❌ co_id está vacío o nulo:', co_id);
        throw new Error('co_id es obligatorio');
      }

      const resultado = await this.solicitudesService.crearSolicitud({
        ...dto,
        cliente_id,
        co_id,
      });

      return {
        ok: true,
        mensaje: 'Solicitud creada correctamente',
        data: resultado,
      };
    } catch (error) {
      console.error('❌ Error al crear la solicitud:', error);
      return {
        ok: false,
        mensaje: 'Error al crear la solicitud',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get('test')
  async testConnection() {
    return this.solicitudesService.testConnection();
  }

  @UseGuards(JwtAuthGuard)
  @Get('pendientes')
  async getPendientes(): Promise<SolicitudPendienteDto[]> {
    try {
      return await this.listadosService.getSolicitudesPendientes();
    } catch (error) {
      console.error('Error obteniendo pendientes:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error obteniendo pendientes',
        500,
      );
    }
  }

  @Get('parametros/dias-respuesta')
  async getDiasRespuesta(): Promise<ParamDiasRespuestaResponseDto[]> {
    console.log('✅ [getDiasRespuesta] Endpoint llamado');
    try {
      const dias = await this.solicitudesService.getDiasRespuesta();
      console.log('✅ [getDiasRespuesta] Datos obtenidos:', dias);
      return dias;
    } catch (error) {
      console.error('❌ [getDiasRespuesta] Error:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async listarSolicitudes(@Query('limit') limit: string) {
    const limitNum = limit ? Number(limit) : 50;
    return this.listadosService.listarSolicitudes(limitNum);
  }

  @UseGuards(JwtAuthGuard)
  @Get('cliente/:clienteId/ultimas')
  async ultimasSolicitudes(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Query('limit') limit?: string,
  ) {
    try {
      console.log(`Buscando últimas solicitudes para cliente ${clienteId}`);
      const limitNum = limit ? Number(limit) : 5;
      const solicitudes =
        await this.listadosService.obtenerSolicitudesPorCliente(clienteId);
      const resultado = solicitudes.slice(0, limitNum);
      console.log(`Se encontraron ${resultado.length} solicitudes`);
      return resultado;
    } catch (error) {
      console.error('Error en ultimasSolicitudes:', error);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('cliente/:clienteId/ultima-respuestas')
  async getUltimaRespuestasCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
  ) {
    const solicitudes =
      await this.listadosService.obtenerSolicitudesPorCliente(clienteId);
    if (!solicitudes || solicitudes.length === 0) {
      return { respuestas: [], solicitudId: null, numeroSolicitud: null };
    }
    const ultima = solicitudes[0];
    const respuestas = await this.respuestasService.obtenerRespuestas(
      ultima.sol_id,
    );
    return {
      respuestas,
      sol_id: ultima.sol_id,
      sol_numero_solicitud: ultima.sol_numero_solicitud,
    };
  }

  @Get('cliente/:clienteId/ultima-pendiente')
  async getUltimaSolicitudPendiente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
  ) {
    const ultima =
      await this.listadosService.obtenerUltimaSolicitudPendiente(clienteId);
    if (!ultima) {
      return { sol_id: null, respuestas: [] };
    }
    const respuestas = await this.respuestasService.obtenerRespuestas(
      ultima.sol_id,
    );
    return { sol_id: ultima.sol_id, respuestas };
  }

  @Get('cliente/:clienteId/ultima-completada')
  async getUltimaSolicitudCompletada(
    @Param('clienteId', ParseIntPipe) clienteId: number,
  ) {
    const ultima =
      await this.listadosService.obtenerUltimaSolicitudCompletada(clienteId);
    if (!ultima) {
      return { sol_id: null, respuestas: [] };
    }
    const respuestas = await this.respuestasService.obtenerRespuestas(
      ultima.sol_id,
    );
    return { sol_id: ultima.sol_id, respuestas };
  }

  @UseGuards(JwtAuthGuard)
  @Get('cliente/:clienteId/ultima')
  async getUltimaSolicitud(
    @Param('clienteId', ParseIntPipe) clienteId: number,
  ) {
    const ultima = await this.listadosService.obtenerUltimaSolicitud(clienteId);
    if (!ultima) {
      return null;
    }
    const respuestas = await this.respuestasService.obtenerRespuestas(
      ultima.sol_id,
    );
    return {
      sol_id: ultima.sol_id,
      sol_numero_solicitud: ultima.sol_numero_solicitud,
      sol_estado_id: Number(ultima.sol_estado_id),
      sol_fecha_creacion: ultima.sol_fecha_creacion,
      sol_fecha_envio: ultima.sol_fecha_envio,
      respuestas,
    };
  }

  @Get('cliente/:clienteId/estadisticas')
  async estadisticasCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
  ) {
    const solicitudes =
      await this.listadosService.obtenerSolicitudesPorCliente(clienteId);
    return {
      total: solicitudes.length,
      borradores: solicitudes.filter((s) => s.sol_estado_id === 1).length,
      pendientes: solicitudes.filter((s) => s.sol_estado_id === 2).length,
      en_revision: solicitudes.filter((s) => s.sol_estado_id === 3).length,
      completadas: solicitudes.filter((s) => s.sol_estado_id === 4).length,
      consumo_promedio:
        solicitudes.length > 0
          ? solicitudes.reduce(
              (sum, s) => sum + (s.sol_consumo_mensual_proyectado || 0),
              0,
            ) / solicitudes.length
          : 0,
    };
  }

  @Get('cliente/:clienteId')
  async obtenerSolicitudesPorCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Query('searchTerm') searchTerm?: string,
    @Query('estado') estado?: string,
  ): Promise<SolicitudClienteDto[]> {
    return this.listadosService.obtenerSolicitudesPorCliente(clienteId, {
      searchTerm,
      estado,
    });
  }

  @Get('ultimas-cliente/:clienteId')
  async getUltimasSolicitudesCliente(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @Query('limit') limit?: string,
  ): Promise<SolicitudClienteDto[]> {
    try {
      console.log(`Buscando últimas solicitudes para cliente ${clienteId}`);
      const limitNum = limit ? Number(limit) : 5;
      const solicitudes =
        await this.listadosService.obtenerSolicitudesPorCliente(clienteId);
      const resultado = solicitudes.slice(0, limitNum);
      console.log(`Se encontraron ${resultado.length} solicitudes`);
      return resultado;
    } catch (error) {
      console.error('Error en getUltimasSolicitudesCliente:', error);
      throw error;
    }
  }

  @Get('ejecutivo/:ejecutivoId/pendientes')
  async getPendientesForEjecutivo(
    @Param('ejecutivoId', ParseIntPipe) ejecutivoId: number,
  ) {
    console.log('📥 Endpoint ejecutado');
    console.log('👉 ejecutivoId recibido:', ejecutivoId);

    const data =
      await this.listadosService.getSolicitudesPendientesPorEjecutivoId(
        ejecutivoId,
      );

    console.log('📤 Resultado:', data);

    return data;
  }

  @Get('listado')
  async getListado(@Query() query: any): Promise<SolicitudListadoGestionDto[]> {
    console.log(
      '\n🔴🔴🔴 [SOLICITUDES-CONTROLLER] getListado() LLAMADO 🔴🔴🔴',
    );
    console.log(
      '🟡 [BACKEND-CONTROLLER] Parámetros de consulta recibidos:',
      query,
    );
    console.log('🟡 [BACKEND-CONTROLLER] Tipos de parámetros:', {
      fecha_desde: typeof query.fecha_desde,
      fecha_hasta: typeof query.fecha_hasta,
      co_id: typeof query.co_id,
      cliente_id: typeof query.cliente_id,
      ejecutivo_id: typeof query.ejecutivo_id,
      estado_id: typeof query.estado_id,
    });
    try {
      const result = await this.listadosService.getListado(query);
      console.log('🟡 [BACKEND-CONTROLLER] Resultado retornado: ', result);
      console.log(
        '🟡 [BACKEND-CONTROLLER] Resultado retornado: ',
        result?.length ? `${result.length} registros` : 'vacío',
      );
      return result;
    } catch (error) {
      console.error('🟡 [BACKEND-CONTROLLER] ❌ ERROR en getListado:', error);
      throw error;
    }
  }

  @Get('documentos')
  async getDocumentos(
    @Query('mode') mode?: string,
    @Query('usr_id') usr_id?: string,
  ) {
    try {
      console.log('🟢🟢🟢 [CONTROLLER] getDocumentos ENDPOINT HIT', {
        mode,
        usr_id,
      });
      const usuarioId = usr_id ? Number(usr_id) : undefined;
      const result = await this.documentosService.getDocumentos(
        mode,
        usuarioId,
      );
      console.log(
        '🟢🟢🟢 [CONTROLLER] getDocumentos RESULTADO:',
        result?.length,
      );
      return result;
    } catch (error) {
      console.error('[getDocumentos] Error:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener documentos',
        500,
      );
    }
  }

  @Get('mis-documentos')
  @UseGuards(JwtAuthGuard)
  async getMisDocumentos(
    @Req()
    req: Request & { user: { cliente_id?: number; cli_id?: number } },
  ) {
    try {
      const clienteId = req.user?.cliente_id ?? req.user?.cli_id;
      if (!clienteId) {
        throw new HttpException('Usuario sin cliente asociado', 400);
      }

      const solicitud =
        await this.listadosService.obtenerUltimaSolicitud(clienteId);

      if (!solicitud) {
        return {
          solicitud: null,
          documentos: [],
          puedeCorregir: false,
          rechazadoPorAuxiliar: false,
        };
      }

      const documentos =
        await this.documentosService.obtenerDocumentosConVigencia(
          solicitud.sol_id,
        );
      const puedeCorregir = [1, 2].includes(Number(solicitud.sol_estado_id));

      // Rechazado por Auxiliar Servicio Cliente: Pendiente(2) + Etapa
      // ASC(3) + Resultado RECHAZADO(3). Misma condición literal ya usada
      // en SolicitudesContent.tsx y en solicitudes-workflow.service.ts.
      const rechazadoPorAuxiliar =
        Number(solicitud.sol_estado_id) === 2 &&
        Number(solicitud.sol_etapa_actual_id) === 3 &&
        Number(solicitud.sol_resultado_etapa_id) === 3;

      return { solicitud, documentos, puedeCorregir, rechazadoPorAuxiliar };
    } catch (error) {
      console.error('[getMisDocumentos] Error:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener documentos',
        500,
      );
    }
  }

  @Get('archivo/:sa_id')
  async descargarArchivo(
    @Param('sa_id', ParseIntPipe) sa_id: number,
    @Res() res: Response,
  ) {
    try {
      const { downloadUrl } =
        await this.documentosService.descargarArchivoRespuesta(sa_id);
      res.redirect(302, downloadUrl);
    } catch (error) {
      console.error('[descargarArchivo] Error:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al descargar archivo',
        404,
      );
    }
  }

  @Get('por-centro-operacion')
  async getSolicitudesPorCentro(
    @Query('co_id', ParseIntPipe) coId: number,
    @Query('estado_id') estadoId?: string,
    @Query('estado_ids') estadoIds?: string,
  ) {
    try {
      const estadoIdNum = estadoId ? Number(estadoId) : undefined;
      const estadoIdsArray = estadoIds
        ? estadoIds
            .split(',')
            .map((id) => Number(id.trim()))
            .filter(Boolean)
        : undefined;

      return await this.listadosService.getSolicitudesPorCentro(
        coId,
        estadoIdNum,
        estadoIdsArray,
      );
    } catch (error: any) {
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Get('por-ejecutivo')
  async getSolicitudesPorEjecutivo(
    @Query('ejecutivo_id', ParseIntPipe) ejecutivoId: number,
  ) {
    try {
      return await this.listadosService.getSolicitudesPorEjecutivo(ejecutivoId);
    } catch (error: any) {
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Get('listado/:usuarioId')
  async getSolicitudesConFiltros(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @Query('etapa_id') etapa_id?: string,
    @Query('resultado_etapa_id') resultado_etapa_id?: string,
    @Query('estado_id') estado_id?: string,
  ) {
    try {
      console.log(
        '[getSolicitudesConFiltros] usuarioId:',
        usuarioId,
        'filtros:',
        { etapa_id, resultado_etapa_id, estado_id },
      );

      const filtros = {
        etapa_id: etapa_id ? parseInt(etapa_id) : undefined,
        resultado_etapa_id: resultado_etapa_id
          ? parseInt(resultado_etapa_id)
          : undefined,
        estado_id: estado_id ? parseInt(estado_id) : undefined,
      };

      const result = await this.listadosService.getSolicitudesConFiltros(
        usuarioId,
        filtros,
      );
      console.log(
        '[getSolicitudesConFiltros] Resultado:',
        result?.length || 0,
        'solicitudes',
      );
      return result;
    } catch (error: any) {
      console.error(
        '[getSolicitudesConFiltros] Error:',
        error.message || error,
      );
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Get('auxiliar-servicio-cliente/:usuarioId')
  async getSolicitudesPendientesAuxiliarServicioCliente(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    try {
      console.log(
        '[getSolicitudesPendientesAuxiliarServicioCliente] usuarioId:',
        usuarioId,
      );
      const result =
        await this.listadosService.getSolicitudesPendientesAuxiliarServicioCliente(
          usuarioId,
        );
      console.log(
        '[getSolicitudesPendientesAuxiliarServicioCliente] Resultado:',
        result?.length || 0,
        'solicitudes',
      );
      return result;
    } catch (error: any) {
      console.error(
        '[getSolicitudesPendientesAuxiliarServicioCliente] Error:',
        error.message || error,
      );
      console.error(
        '[getSolicitudesPendientesAuxiliarServicioCliente] Stack:',
        error.stack,
      );
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Get('oc/:usuarioId')
  async getSolicitudesParaOC(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    try {
      console.log('[getSolicitudesParaOC] usuarioId:', usuarioId);
      const result = await this.listadosService.getSolicitudesParaOC(usuarioId);
      console.log(
        '[getSolicitudesParaOC] Resultado:',
        result?.length || 0,
        'solicitudes',
      );
      return result;
    } catch (error: any) {
      console.error('[getSolicitudesParaOC] Error:', error.message || error);
      console.error('[getSolicitudesParaOC] Stack:', error.stack);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Get('comite-credito-1/:usuarioId')
  async getSolicitudesParaComiteCredito1(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    try {
      console.log('[getSolicitudesParaComiteCredito1] usuarioId:', usuarioId);
      const result =
        await this.listadosService.getSolicitudesParaComiteCredito1(usuarioId);
      console.log(
        '[getSolicitudesParaComiteCredito1] Resultado:',
        result?.length || 0,
        'solicitudes',
      );
      return result;
    } catch (error: any) {
      console.error(
        '[getSolicitudesParaComiteCredito1] Error:',
        error.message || error,
      );
      console.error('[getSolicitudesParaComiteCredito1] Stack:', error.stack);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Get('comite-credito-2/:usuarioId')
  async getSolicitudesParaComiteCredito2(
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
  ) {
    try {
      console.log('[getSolicitudesParaComiteCredito2] usuarioId:', usuarioId);
      const result =
        await this.listadosService.getSolicitudesParaComiteCredito2(usuarioId);
      console.log(
        '[getSolicitudesParaComiteCredito2] Resultado:',
        result?.length || 0,
        'solicitudes',
      );
      return result;
    } catch (error: any) {
      console.error(
        '[getSolicitudesParaComiteCredito2] Error:',
        error.message || error,
      );
      console.error('[getSolicitudesParaComiteCredito2] Stack:', error.stack);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  // ====== RUTAS ESPECÍFICAS CON :id (DEBE ESTAR ANTES DE @Get(':id')) ======

  @Get(':id/formulario-renderizable')
  async getFormularioRenderizable(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.formularioRenderizableService.obtenerFormularioRenderizable(
        id,
      );
    } catch (error) {
      console.error('Error obteniendo formulario renderizable:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener formulario',
        500,
      );
    }
  }

  @Get(':id/pdf')
  async generarPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    try {
      const pdfBuffer = await this.solicitudesService.generarPdfSolicitud(id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="solicitud-${id}.pdf"`,
      );
      res.send(pdfBuffer);
    } catch (error) {
      console.error('Error generando PDF:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al generar PDF',
        500,
      );
    }
  }

  @Get(':id/respuestas/archivo/:saId')
  async obtenerRespuestaArchivo(
    @Param('id', ParseIntPipe) solicitudId: number,
    @Param('saId', ParseIntPipe) saId: number,
    @Res() res: Response,
  ) {
    try {
      const archivo = await this.respuestasService.obtenerRespuestaArchivo(
        solicitudId,
        saId,
      );

      res.redirect(302, archivo.downloadUrl);
    } catch (error) {
      console.error('Error al obtener archivo:', error);
      const statusCode =
        error instanceof Error && (error as any).statusCode
          ? (error as any).statusCode
          : 500;
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener archivo',
        statusCode,
      );
    }
  }

  @Get(':id/respuestas/archivo')
  async obtenerArchivosExistentes(
    @Param('id', ParseIntPipe) solicitudId: number,
  ) {
    try {
      const archivos =
        await this.documentosService.obtenerArchivosExistentes(solicitudId);
      return {
        ok: true,
        data: archivos,
      };
    } catch (error) {
      console.error('Error al obtener archivos existentes:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener archivos',
        500,
      );
    }
  }

  @Get(':id/respuestas')
  async obtenerRespuestas(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SolicitudRespuestaDto[]> {
    return this.respuestasService.obtenerRespuestas(id);
  }

  @Get(':id/workflow-historial')
  @UseGuards(JwtAuthGuard)
  async obtenerWorkflowHistorial(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.workflowService.obtenerWorkflowHistorial(id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener historial',
        500,
      );
    }
  }

  @Delete(':id/respuestas/archivo/:saId')
  @UseGuards(JwtAuthGuard)
  async eliminarRespuestaArchivo(
    @Param('id', ParseIntPipe) solicitudId: number,
    @Param('saId', ParseIntPipe) saId: number,
    @Req()
    req: Request & {
      user: { rol?: string; cliente_id?: number; cli_id?: number };
    },
  ) {
    try {
      await this.documentosService.verificarAccesoSolicitud(
        solicitudId,
        req.user,
      );
      return await this.respuestasService.eliminarRespuestaArchivo(
        solicitudId,
        saId,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      console.error('Error al eliminar archivo:', error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al eliminar archivo',
        500,
      );
    }
  }

  @Post('respuestas')
  async guardarRespuesta(@Body() dto: any) {
    try {
      console.log('POST /solicitudes/respuestas - Body:', dto);
      const resultado = await this.respuestasService.guardarRespuesta(dto);
      return {
        ok: true,
        mensaje: 'Respuesta guardada correctamente',
        data: resultado,
      };
    } catch (error) {
      console.error('Error al guardar respuesta:', error);
      return {
        ok: false,
        mensaje: 'Error al guardar respuesta',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Post('respuestas/archivo')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('archivo'))
  async guardarRespuestaArchivo(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: any,
    @Req()
    req: Request & {
      user: {
        usr_id: number;
        rol?: string;
        cliente_id?: number;
        cli_id?: number;
      };
    },
  ) {
    try {
      console.log(
        '🔴 POST /solicitudes/respuestas/archivo - DTO completo:',
        JSON.stringify(dto),
      );
      console.log(
        '🔴 POST /solicitudes/respuestas/archivo - fechaEmision en DTO:',
        dto?.fechaEmision || 'NO ENCONTRADA',
      );
      console.log('🔴 POST /solicitudes/respuestas/archivo - File:', {
        originalname: file?.originalname,
        size: file?.size,
        mimetype: file?.mimetype,
      });

      if (!file) {
        throw new BadRequestException('No se proporcionó ningún archivo');
      }

      await this.documentosService.verificarAccesoSolicitud(
        Number(dto?.sa_sol_id),
        req.user,
      );

      const resultado = await this.respuestasService.guardarRespuestaArchivo(
        dto,
        file,
        req.user?.usr_id,
      );
      return resultado;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      console.error('❌ Error al guardar archivo:', error);
      return {
        ok: false,
        mensaje: 'Error al guardar archivo',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Patch(':id/respuestas/documento/fecha')
  @UseGuards(JwtAuthGuard)
  async actualizarFechaDocumento(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { fp_id: number; fechaEmision: string },
    @Req()
    req: Request & {
      user: {
        usr_id: number;
        rol?: string;
        cliente_id?: number;
        cli_id?: number;
      };
    },
  ) {
    try {
      console.log('📅 PATCH /solicitudes/:id/respuestas/documento/fecha:', {
        id,
        fp_id: body.fp_id,
        fechaEmision: body.fechaEmision,
      });
      await this.documentosService.verificarAccesoSolicitud(id, req.user);
      return await this.respuestasService.actualizarFechaDocumento(
        id,
        body.fp_id,
        body.fechaEmision,
        req.user?.usr_id,
      );
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      console.error('❌ Error al actualizar fecha:', error);
      return {
        ok: false,
        mensaje: 'Error al actualizar fecha',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Patch(':id/estado')
  @UseGuards(JwtAuthGuard)
  async cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { estadoId: number },
    @Req() req: Request & { user: { usr_id?: number; id?: number } },
  ) {
    const usuarioId = req.user?.usr_id || req.user?.id;
    return this.workflowService.cambiarEstado(id, body.estadoId, usuarioId);
  }

  @Patch(':id/resultado-pendiente')
  @UseGuards(JwtAuthGuard)
  async actualizarResultadoPendiente(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request & { user: { usr_id?: number; id?: number } },
  ) {
    try {
      console.log(
        `[actualizarResultadoPendiente] Actualizando solicitud ${id} a resultado PENDIENTE`,
      );
      const usuarioId = req.user?.usr_id || req.user?.id;
      return await this.workflowService.actualizarResultadoPendiente(
        id,
        usuarioId,
      );
    } catch (error: any) {
      console.error(
        '[actualizarResultadoPendiente] Error:',
        error.message || error,
      );
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Put(':id/aprobacion')
  @UseGuards(JwtAuthGuard)
  async aprobarRechazarSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    try {
      console.log(
        '[aprobarRechazarSolicitud] ID:',
        id,
        'Body:',
        JSON.stringify(body, null, 2),
      );

      const {
        aprobado,
        motivo_rechazo_id,
        modo_solucion,
        fecha_estimada_respuesta_comercial,
        documentos_faltantes,
      } = body;

      if (aprobado === undefined) {
        throw new Error('aprobado es requerido');
      }

      // Convertir strings de fecha a Date
      const fechaEstimada = fecha_estimada_respuesta_comercial
        ? new Date(fecha_estimada_respuesta_comercial)
        : undefined;

      const usuario_modifica = req.user.usr_id;

      const result = await this.workflowService.aprobarRechazarSolicitud(
        id,
        aprobado,
        motivo_rechazo_id,
        modo_solucion,
        fechaEstimada,
        usuario_modifica,
        Array.isArray(documentos_faltantes) ? documentos_faltantes : undefined,
      );
      console.log('[aprobarRechazarSolicitud] Resultado:', result);
      return result;
    } catch (error: any) {
      console.error(
        '[aprobarRechazarSolicitud] Error:',
        error.message || error,
      );
      console.error('[aprobarRechazarSolicitud] Stack:', error.stack);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Put(':id/concepto-ejecutivo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('EJECUTIVO', 'ADMIN')
  async guardarGestionEjecutivo(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    try {
      console.log(
        `💾 [CONTROLLER] PUT /solicitudes/${id}/concepto-ejecutivo - Body:`,
        body,
      );
      const {
        consumo_mensual_proyectado,
        observacionesComercial,
        fecha_real_ejecutivo,
      } = body;

      if (consumo_mensual_proyectado == null) {
        throw new Error('consumo_mensual_proyectado es requerido');
      }

      const usuario_modifica = req.user.usr_id;

      // Guardar concepto del ejecutivo. El propio servicio ya deja la
      // solicitud en estado REVISIÓN, etapa ASC, resultado PENDIENTE
      // (cambiarEtapa + UPDATE), no hace falta repetirlo aparte.
      const result = await this.workflowService.guardarGestionEjecutivo(
        id,
        consumo_mensual_proyectado,
        observacionesComercial,
        usuario_modifica,
        fecha_real_ejecutivo,
      );
      console.log(`✅ [CONTROLLER] Concepto guardado exitosamente`);

      return result;
    } catch (error: any) {
      console.error(`❌ [CONTROLLER] Error guardando concepto:`, error);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Put(':id/concepto-servicio-cliente')
  @UseGuards(JwtAuthGuard)
  async guardarGestionAuxiliarServicioCliente(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    try {
      console.log(
        `💾 [CONTROLLER] PUT /solicitudes/${id}/concepto-servicio-cliente`,
      );
      const { comentario } = body;
      const usuario_modifica = req.user.usr_id;

      const result = await this.workflowService.guardarConceptoGenerico(
        id,
        'OFC',
        comentario,
        usuario_modifica,
      );
      return result;
    } catch (error: any) {
      console.error(
        '[guardarGestionAuxiliarServicioCliente] Error:',
        error.message,
      );
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Put(':id/concepto-oficial-cumplimiento')
  @UseGuards(JwtAuthGuard)
  async guardarConceptoOficialCumplimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    try {
      console.log(
        `💾 [CONTROLLER] PUT /solicitudes/${id}/concepto-oficial-cumplimiento`,
      );
      const { comentario, aprobado, motivo_rechazo_id } = body;
      const usuario_modifica = req.user.usr_id;

      const result = await this.workflowService.guardarConceptoGenerico(
        id,
        'CC1',
        comentario,
        usuario_modifica,
        aprobado !== false,
        motivo_rechazo_id,
      );
      return result;
    } catch (error: any) {
      console.error(
        '[guardarConceptoOficialCumplimiento] Error:',
        error.message,
      );
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Put(':id/concepto-comite-credito-1')
  @UseGuards(JwtAuthGuard)
  async guardarConceptoComiteCredito1(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    try {
      console.log(
        `💾 [CONTROLLER] PUT /solicitudes/${id}/concepto-comite-credito-1`,
      );
      const { comentario, recomendacion } = body;
      const usuario_modifica = req.user.usr_id;
      const aprobado = recomendacion === 'aprobado';

      console.log(
        `[CONTROLLER] Recomendación: ${recomendacion}, Aprobado: ${aprobado}`,
      );

      const result = await this.workflowService.guardarConceptoGenerico(
        id,
        'CC2',
        comentario,
        usuario_modifica,
        aprobado,
      );
      return result;
    } catch (error: any) {
      console.error('[guardarConceptoComiteCredito1] Error:', error.message);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Put(':id/concepto-comite-credito-2')
  @UseGuards(JwtAuthGuard)
  async guardarConceptoComiteCredito2(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
    @Req() req: Request & { user: { usr_id: number } },
  ) {
    try {
      console.log(
        `💾 [CONTROLLER] PUT /solicitudes/${id}/concepto-comite-credito-2`,
      );
      const { comentario, recomendacion, cupo, plazoPago, formaPago } = body;
      const usuario_modifica = req.user.usr_id;
      const aprobado = recomendacion === 'aprobado';

      console.log(
        `[CONTROLLER] Recomendación: ${recomendacion}, Aprobado: ${aprobado}`,
      );

      // Preparar condiciones financieras si se aprueba
      const condiciones = aprobado
        ? {
            cupo: cupo ? parseFloat(cupo) : undefined,
            plazoPago: plazoPago ? parseInt(plazoPago) : undefined,
            formaPago: formaPago || undefined,
          }
        : undefined;

      const result = await this.workflowService.guardarConceptoGenerico(
        id,
        null,
        comentario,
        usuario_modifica,
        aprobado,
        undefined,
        condiciones,
      );
      return result;
    } catch (error: any) {
      console.error('[guardarConceptoComiteCredito2] Error:', error.message);
      throw new HttpException(error.message || 'Error interno', 500);
    }
  }

  @Delete(':id')
  async deleteSolicitud(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.documentosService.deleteSolicitud(id);
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      throw new HttpException(error.message || 'Error interno', statusCode);
    }
  }

  @Get('workflow/etapas')
  async getEtapas(): Promise<WorkflowEtapaResponseDto[]> {
    try {
      return await this.solicitudesService.getEtapas();
    } catch (error) {
      console.error('Error obteniendo etapas:', error);
      return [];
    }
  }

  @Get('workflow/resultados')
  async getResultados(): Promise<WorkflowResultadoResponseDto[]> {
    try {
      return await this.solicitudesService.getResultados();
    } catch (error) {
      console.error('Error obteniendo resultados:', error);
      return [];
    }
  }

  @Put(':id/estado-flujo')
  @UseGuards(JwtAuthGuard)
  async actualizarEstadoFlujo(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      estado_id: number;
      etapa_actual_id: number;
      resultado_etapa_id: number;
      usuario_modifica: number;
    },
  ) {
    try {
      return await this.workflowService.actualizarEstadoFlujo(
        id,
        body.estado_id,
        body.etapa_actual_id,
        body.resultado_etapa_id,
        body.usuario_modifica,
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      throw new HttpException(error.message || 'Error interno', statusCode);
    }
  }

  @Put(':id/estado-flujo-automatico')
  @UseGuards(JwtAuthGuard)
  async actualizarEstadoFlujoAutomatico(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      estadoCodigo: string;
      etapaCodigo: string;
      resultadoCodigo: string;
      usuario_modifica: number;
    },
  ) {
    try {
      return await this.workflowService.actualizarEstadoFlujoAutomatico(
        id,
        body.estadoCodigo,
        body.etapaCodigo,
        body.resultadoCodigo,
        body.usuario_modifica,
      );
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      throw new HttpException(error.message || 'Error interno', statusCode);
    }
  }

  // ====== RUTA GENÉRICA (DEBE ESTAR DESPUÉS DE TODAS LAS ESPECÍFICAS) ======

  @Get(':id')
  async obtenerSolicitud(@Param('id', ParseIntPipe) id: number) {
    try {
      console.log(`📋 [CONTROLLER] GET /solicitudes/${id}`);
      const result = await this.documentosService.obtenerSolicitud(id);
      console.log(
        `✅ [CONTROLLER] Resultado: ${result ? 'solicitud encontrada' : 'no encontrada'}`,
      );
      return result;
    } catch (error) {
      console.error(`❌ [CONTROLLER] Error en GET :id (${id}):`, error);
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener solicitud',
        500,
      );
    }
  }

  @Get(':id/documentos-requeridos')
  @UseGuards(JwtAuthGuard)
  async getDocumentosRequeridos(@Param('id', ParseIntPipe) id: number) {
    try {
      const documentos =
        await this.documentosService.getDocumentosRequeridos(id);
      return documentos;
    } catch (error) {
      console.error(
        `❌ [CONTROLLER] Error en GET documentos-requeridos (${id}):`,
        error,
      );
      throw new HttpException(
        error instanceof Error ? error.message : 'Error al obtener documentos',
        500,
      );
    }
  }
}
