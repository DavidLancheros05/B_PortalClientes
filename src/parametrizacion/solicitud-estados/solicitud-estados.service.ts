import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface SolicitudEstado {
  id: number;
  codigo: string;
  nombre: string;
}

// Único punto de resolución de `solicitud_estados` (BORRADOR, PENDIENTE,
// REVISION, COMPLETADA, APROBADA, RECHAZADA). Antes cada método que
// necesitaba un `ses_id` repetía su propio `SELECT ... WHERE ses_codigo`
// (más de 10 puntos entre solicitudes-workflow.service.ts y
// notificaciones.service.ts); dos de esos puntos nunca se escribieron así y
// quedaron con el id quemado, desfasado del catálogo real (ver
// documentacion/auditoria-valores-quemados-hardcodeados.md, bugs #1 y #2).
// Cacheado en memoria porque el catálogo son 6 filas que casi no cambian —
// evita un round-trip a la BD por cada llamada, algo que si se repite en un
// método con varios lookups (ej. guardarConceptoGenerico) se nota en la
// latencia del endpoint.
@Injectable()
export class SolicitudEstadosService {
  private porCodigo: Map<string, SolicitudEstado> | null = null;
  private porId: Map<number, SolicitudEstado> | null = null;

  constructor(private readonly dataSource: DataSource) {}

  private async cargarCache(): Promise<void> {
    if (this.porCodigo) return;

    const rows: { ses_id: number; ses_codigo: string; ses_nombre: string }[] =
      await this.dataSource.query(
        `SELECT ses_id, ses_codigo, ses_nombre FROM solicitud_estados`,
      );

    const porCodigo = new Map<string, SolicitudEstado>();
    const porId = new Map<number, SolicitudEstado>();
    for (const r of rows) {
      const estado: SolicitudEstado = {
        id: r.ses_id,
        codigo: r.ses_codigo,
        nombre: r.ses_nombre,
      };
      porCodigo.set(r.ses_codigo, estado);
      porId.set(r.ses_id, estado);
    }
    this.porCodigo = porCodigo;
    this.porId = porId;
  }

  // Mismo nombre/forma que WorkflowService.obtenerEtapaPorCodigo /
  // obtenerResultadoPorCodigo (src/solicitudes/workflow.service.ts), para
  // que los tres catálogos de workflow se resuelvan de forma consistente.
  async obtenerEstadoPorCodigo(
    codigo: string,
  ): Promise<SolicitudEstado | undefined> {
    await this.cargarCache();
    return this.porCodigo!.get(codigo);
  }

  async obtenerEstadoPorId(id: number): Promise<SolicitudEstado | undefined> {
    await this.cargarCache();
    return this.porId!.get(id);
  }

  // Catálogo completo, para que el frontend deje de mantener su propia
  // copia hardcodeada (ver constants/estado-solicitud.ts y
  // lib/workflow-labels.ts en F_PortalClientes).
  async obtenerTodos(): Promise<SolicitudEstado[]> {
    await this.cargarCache();
    return [...this.porId!.values()].sort((a, b) => a.id - b.id);
  }

  // Por si alguna vez se necesita reflejar en caliente un cambio manual en
  // la tabla (hoy no hay ninguna pantalla de administración que la edite).
  invalidarCache(): void {
    this.porCodigo = null;
    this.porId = null;
  }
}
