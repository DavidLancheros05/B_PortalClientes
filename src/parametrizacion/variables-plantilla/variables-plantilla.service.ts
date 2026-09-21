import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { VariablePlantilla } from './variables-plantilla.entity';
import {
  CreateVariablePlantillaDto,
  TABLAS_ORIGEN_PERMITIDAS,
} from './dto/create-variable-plantilla.dto';
import { UpdateVariablePlantillaDto } from './dto/update-variable-plantilla.dto';

type TablaOrigen = (typeof TABLAS_ORIGEN_PERMITIDAS)[number];

@Injectable()
export class VariablesPlantillaService {
  constructor(
    @InjectRepository(VariablePlantilla)
    private repo: Repository<VariablePlantilla>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  findAll() {
    return this.repo.find({ order: { pvp_ambito: 'ASC', pvp_id: 'ASC' } });
  }

  // Lista las columnas reales de una tabla "ancla" permitida — alimenta el
  // selector de "Columna origen" en la pantalla. Tabla siempre viene de la
  // whitelist (validada acá y en el DTO), nunca se interpola texto libre
  // del usuario en el SQL.
  async getColumnas(tabla: string): Promise<string[]> {
    this.validarTablaPermitida(tabla);
    const rows = await this.dataSource.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_NAME = @0
       ORDER BY ORDINAL_POSITION`,
      [tabla],
    );
    return rows.map((r: any) => r.COLUMN_NAME);
  }

  private validarTablaPermitida(tabla: string): asserts tabla is TablaOrigen {
    if (!TABLAS_ORIGEN_PERMITIDAS.includes(tabla as TablaOrigen)) {
      throw new BadRequestException(
        `Tabla no permitida: ${tabla}. Solo se admite ${TABLAS_ORIGEN_PERMITIDAS.join(', ')}.`,
      );
    }
  }

  private async validarColumnaExiste(tabla: TablaOrigen, columna: string) {
    const columnas = await this.getColumnas(tabla);
    if (!columnas.includes(columna)) {
      throw new BadRequestException(
        `La columna ${columna} no existe en la tabla ${tabla}.`,
      );
    }
  }

  private async validarOrigenDato(
    tablaOrigen?: string | null,
    columnaOrigen?: string | null,
  ) {
    const tieneTabla = tablaOrigen != null;
    const tieneColumna = columnaOrigen != null;
    if (tieneTabla !== tieneColumna) {
      throw new BadRequestException(
        'pvp_tabla_origen y pvp_columna_origen deben mandarse juntos (ambos o ninguno).',
      );
    }
    if (tieneTabla && tieneColumna) {
      this.validarTablaPermitida(tablaOrigen!);
      await this.validarColumnaExiste(
        tablaOrigen as TablaOrigen,
        columnaOrigen!,
      );
    }
  }

  async create(dto: CreateVariablePlantillaDto) {
    const existente = await this.repo.findOne({
      where: { pvp_placeholder: dto.pvp_placeholder },
    });
    if (existente) {
      throw new ConflictException(
        `Ya existe una variable con el placeholder ${dto.pvp_placeholder}`,
      );
    }

    await this.validarOrigenDato(dto.pvp_tabla_origen, dto.pvp_columna_origen);

    const nueva = this.repo.create({
      ...dto,
      pvp_resuelta: dto.pvp_resuelta ?? false,
      pvp_formato: dto.pvp_formato ?? 'TEXTO',
      pvp_estado: true,
    });
    return this.repo.save(nueva);
  }

  async update(id: number, dto: UpdateVariablePlantillaDto) {
    const item = await this.repo.findOne({ where: { pvp_id: id } });
    if (!item) throw new NotFoundException('Variable no encontrada');

    if (
      dto.pvp_tabla_origen !== undefined ||
      dto.pvp_columna_origen !== undefined
    ) {
      const tabla =
        dto.pvp_tabla_origen !== undefined
          ? dto.pvp_tabla_origen
          : item.pvp_tabla_origen;
      const columna =
        dto.pvp_columna_origen !== undefined
          ? dto.pvp_columna_origen
          : item.pvp_columna_origen;
      await this.validarOrigenDato(tabla, columna);
    }

    await this.repo.update(id, dto);
    return this.repo.findOne({ where: { pvp_id: id } });
  }

  async cambiarEstado(id: number, estado: boolean) {
    const item = await this.repo.findOne({ where: { pvp_id: id } });
    if (!item) throw new NotFoundException('Variable no encontrada');
    return this.repo.update({ pvp_id: id }, { pvp_estado: estado });
  }

  // Guardrail: no se puede borrar una variable si su placeholder literal
  // aparece en el contenido de ALGÚN Tipos_documentos (activo o inactivo —
  // un documento inactivo puede reactivarse). Devuelve la lista de
  // documentos que la usan para que el mensaje de error sea accionable.
  async remove(id: number) {
    const item = await this.repo.findOne({ where: { pvp_id: id } });
    if (!item) throw new NotFoundException('Variable no encontrada');

    const enUso = await this.dataSource.query(
      `SELECT tdo_id, tdo_nombre FROM Tipos_documentos
       WHERE tdo_plantilla_contenido LIKE '%' + @0 + '%'`,
      [item.pvp_placeholder],
    );

    if (enUso.length > 0) {
      const nombres = enUso.map((d: any) => d.tdo_nombre).join(', ');
      throw new BadRequestException(
        `No se puede eliminar: ${item.pvp_placeholder} está en uso en ${enUso.length} documento(s): ${nombres}`,
      );
    }

    await this.repo.delete(id);
    return { ok: true };
  }

  private formatearValor(valor: any, formato: string): string {
    if (valor === null || valor === undefined || valor === '') return '-';
    if (formato === 'MONEDA') {
      const num = Number(valor);
      if (Number.isNaN(num)) return '-';
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(num);
    }
    if (formato === 'DIAS') {
      return `${valor} días`;
    }
    if (formato === 'FECHA') {
      const fecha = valor instanceof Date ? valor : new Date(valor);
      if (Number.isNaN(fecha.getTime())) return '-';
      return fecha.toLocaleDateString('es-CO');
    }
    return String(valor);
  }

  // Resuelve automáticamente el valor real de cada variable del catálogo
  // que tenga pvp_tabla_origen/pvp_columna_origen configurados, para una
  // solicitud puntual — reemplaza el "reemplazosExtra"/"reemplazosCartaMap"
  // hardcodeado que antes vivía repetido en 3 lugares (GenerarPlantillaModal
  // en frontend, abrirCartaPDF en solicitudes/[id]/detalle, y
  // enviarCartaVinculacionPorCorreo en el backend). Variables sin mapeo
  // (representante_legal_*, fecha_aprobacion) simplemente no aparecen acá —
  // quien llame sigue resolviéndolas a mano y las mezcla aparte.
  async resolverParaSolicitud(
    solicitudId: number,
  ): Promise<Record<string, string>> {
    const variables = await this.repo.find({
      where: { pvp_estado: true, pvp_resuelta: true },
    });
    const conMapeo = variables.filter(
      (v) => v.pvp_tabla_origen && v.pvp_columna_origen,
    );
    if (conMapeo.length === 0) return {};

    const necesitaSolicitud = conMapeo.some(
      (v) => v.pvp_tabla_origen === 'solicitudes',
    );
    const necesitaCliente = conMapeo.some(
      (v) => v.pvp_tabla_origen === 'clientes',
    );

    const [solicitudRows] = await Promise.all([
      this.dataSource.query('SELECT * FROM solicitudes WHERE sol_id = @0', [
        solicitudId,
      ]),
    ]);
    const solicitud = solicitudRows[0];
    if (!solicitud) return {};

    let cliente: any = null;
    if (necesitaCliente && solicitud.sol_cli_id) {
      const clienteRows = await this.dataSource.query(
        'SELECT * FROM clientes WHERE cli_id = @0',
        [solicitud.sol_cli_id],
      );
      cliente = clienteRows[0] || null;
    }
    void necesitaSolicitud; // solicitud siempre se consulta (es el ancla principal)

    const resultado: Record<string, string> = {};
    for (const v of conMapeo) {
      const fuente = v.pvp_tabla_origen === 'clientes' ? cliente : solicitud;
      const valorCrudo = fuente ? fuente[v.pvp_columna_origen as string] : null;
      resultado[v.pvp_placeholder] = this.formatearValor(
        valorCrudo,
        v.pvp_formato,
      );
    }
    return resultado;
  }
}
