import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ClienteEntity } from './entities/clientes.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClienteListResponseDto } from './dto/cliente-list.response.dto';
import { ClienteDetailResponseDto } from './dto/cliente-detail.response.dto';
import { CentroOperacionResponseDto } from './dto/centro-operacion.response.dto';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
  ) {}

  // ========================
  // LISTAR (con estado y ejecutivoId)
  // ========================
  async findAll(): Promise<ClienteListResponseDto[]> {
    const result = await this.clienteRepo.query(`
      SELECT
        c.cli_id AS [cli_id],
        c.cli_razon_social AS [cli_razon_social],
        c.cli_nro_identificacion AS [cli_nro_identificacion],
        c.cli_direccion AS [cli_direccion],
        c.cli_correo AS [cli_correo],
        c.cli_estado AS [cli_estado],
        c.ejng_id AS [ejng_id],
        e.ejng_nombre AS [ejng_nombre]
      FROM dbo.Clientes c
      LEFT JOIN dbo.Ejecutivo_negocio e ON e.ejng_id = c.ejng_id
      ORDER BY c.cli_razon_social ASC
    `);

    return result.map((item: any) => ({
      cli_id: item.cli_id,
      cli_razon_social: item.cli_razon_social,
      cli_nro_identificacion: item.cli_nro_identificacion,
      cli_direccion: item.cli_direccion,
      cli_correo: item.cli_correo,
      cli_estado: item.cli_estado,
      ejng_id: item.ejng_id,
      ejecutivo: item.ejng_nombre ? { nombre: item.ejng_nombre } : null,
    }));
  }

  // ========================
  // UNO (con todos los campos + centroOperacionIds)
  // ========================
  async findOne(cli_id: number): Promise<ClienteDetailResponseDto> {
    const result = await this.clienteRepo.query(
      `
      SELECT
        c.cli_id AS [cli_id],
        c.cli_razon_social AS [cli_razon_social],
        c.cli_nro_identificacion AS [cli_nro_identificacion],
        c.cli_direccion AS [cli_direccion],
        c.cli_tipo_identificacion AS [cli_tipo_identificacion],
        c.cli_acceso_portal_clientes AS [cli_acceso_portal_clientes],
        c.cli_correo AS [cli_correo],
        c.cli_estado AS [cli_estado],
        e.ejng_nombre AS [ejng_nombre],
        c.ejng_id AS [ejng_id]
      FROM dbo.Clientes c
      LEFT JOIN dbo.Ejecutivo_negocio e ON e.ejng_id = c.ejng_id
      WHERE c.cli_id = @0
    `,
      [cli_id],
    );

    if (!result || result.length === 0) {
      throw new NotFoundException('Cliente no existe');
    }

    const cliente = result[0];

    // Obtener centrosOperacionIds
    const centrosResult = await this.clienteRepo.query(
      `
      SELECT DISTINCT dcc.cop_id AS [cop_id]
      FROM dbo.Detalle_cliente_centro dcc
      WHERE dcc.cli_id = @0 AND dcc.dclc_estado = 'A'
    `,
      [cli_id],
    );

    const centro_operacion_ids = centrosResult.map((row: any) => row.cop_id);

    return {
      cli_id: cliente.cli_id,
      cli_razon_social: cliente.cli_razon_social,
      cli_nro_identificacion: cliente.cli_nro_identificacion,
      cli_tipo_identificacion: cliente.cli_tipo_identificacion,
      cli_direccion: cliente.cli_direccion,
      cli_correo: cliente.cli_correo,
      cli_acceso_portal_clientes: cliente.cli_acceso_portal_clientes,
      cli_estado: cliente.cli_estado,
      ejng_id: cliente.ejng_id,
      ejecutivo: cliente.ejng_nombre
        ? { nombre: cliente.ejng_nombre }
        : null,
      centro_operacion_ids,
    };
  }

  // ========================
  // FILTRAR POR CENTRO (con estado)
  // ========================
  async findByCentro(copId: number): Promise<ClienteListResponseDto[]> {
    const result = await this.clienteRepo.query(
      `
      SELECT DISTINCT
        c.cli_id AS [cli_id],
        c.cli_razon_social AS [cli_razon_social],
        c.cli_nro_identificacion AS [cli_nro_identificacion],
        c.cli_direccion AS [cli_direccion],
        c.cli_correo AS [cli_correo],
        c.cli_estado AS [cli_estado],
        c.ejng_id AS [ejng_id],
        e.ejng_nombre AS [ejng_nombre]
      FROM dbo.Clientes c
      INNER JOIN dbo.Detalle_cliente_centro dcc ON dcc.cli_id = c.cli_id
      LEFT JOIN dbo.Ejecutivo_negocio e ON e.ejng_id = c.ejng_id
      WHERE dcc.cop_id = @0 AND dcc.dclc_estado = 'A'
      ORDER BY c.cli_razon_social ASC
    `,
      [copId],
    );

    return result.map((item: any) => ({
      cli_id: item.cli_id,
      cli_razon_social: item.cli_razon_social,
      cli_nro_identificacion: item.cli_nro_identificacion,
      cli_direccion: item.cli_direccion,
      cli_correo: item.cli_correo,
      cli_estado: item.cli_estado,
      ejng_id: item.ejng_id,
      ejecutivo: item.ejng_nombre ? { nombre: item.ejng_nombre } : null,
    }));
  }

  // ========================
  // CENTROS PARA UN CLIENTE
  // ========================
  async getClienteCentros(
    cli_id: number,
  ): Promise<CentroOperacionResponseDto[]> {
    const result = await this.clienteRepo.query(
      `
      SELECT
        cop_id AS [cop_id],
        cop_nombre AS [cop_nombre]
      FROM dbo.Detalle_cliente_centro dcc
      INNER JOIN dbo.Centros_operacion co ON co.cop_id = dcc.cop_id
      WHERE dcc.cli_id = @0 AND dcc.dclc_estado = 'A'
    `,
      [cli_id],
    );

    return result.map((item: any) => ({
      cop_id: item.cop_id,
      cop_nombre: item.cop_nombre,
    }));
  }

  // ========================
  // ELIMINAR (soft-delete)
  // ========================
  async delete(cli_id: number): Promise<void> {
    const cliente = await this.clienteRepo.findOne({
      where: { cli_id: cli_id },
    });

    if (!cliente) {
      throw new NotFoundException('Cliente no existe');
    }

    await this.clienteRepo.update(cli_id, { cli_estado: 'I' });
  }

  // ========================
  // CREAR
  // ========================
  async create(dto: CreateClienteDto): Promise<ClienteDetailResponseDto> {
    const entity = plainToInstance(ClienteEntity, {
      cli_razon_social: dto.cli_razon_social,
      cli_nro_identificacion: dto.cli_nro_identificacion,
      cli_tipo_identificacion: dto.cli_tipo_identificacion,
      cli_direccion: dto.cli_direccion,
      cli_correo: dto.cli_correo,
      cli_acceso_portal_clientes: dto.cli_acceso_portal_clientes ?? false,
      ejng_id: dto.ejng_id,
      cli_estado: 'A',
    });

    const saved = await this.clienteRepo.save(entity);

    // Insertar centros operación
    if (dto.centro_operacion_ids && Array.isArray(dto.centro_operacion_ids)) {
      for (const copId of dto.centro_operacion_ids) {
        await this.clienteRepo.query(
          `INSERT INTO dbo.Detalle_cliente_centro (cli_id, cop_id, dclc_estado)
           VALUES (@0, @1, 'A')`,
          [saved.cli_id, copId],
        );
      }
    }

    return this.findOne(saved.cli_id);
  }

  // ========================
  // ACTUALIZAR
  // ========================
  async update(
    cli_id: number,
    dto: UpdateClienteDto,
  ): Promise<ClienteDetailResponseDto> {
    const { centro_operacion_ids, ...updateData } = dto;

    const updateEntity = plainToInstance(ClienteEntity, updateData, {
      excludeExtraneousValues: false,
    });

    await this.clienteRepo.update(cli_id, updateEntity);

    if (centro_operacion_ids && Array.isArray(centro_operacion_ids)) {
      await this.clienteRepo.query(
        'DELETE FROM dbo.Detalle_cliente_centro WHERE cli_id = @0',
        [cli_id],
      );

      for (const copId of centro_operacion_ids) {
        await this.clienteRepo.query(
          `INSERT INTO dbo.Detalle_cliente_centro (cli_id, cop_id, dclc_estado)
           VALUES (@0, @1, 'A')`,
          [cli_id, copId],
        );
      }
    }

    return this.findOne(cli_id);
  }
}
