import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { ClienteEntity } from './entities/clientes.entity';
import { CreateClienteDto } from './dto/create-cliente.dto';
import { UpdateClienteDto } from './dto/update-cliente.dto';
import { ClienteListResponseDto } from './dto/cliente-list.response.dto';
import { ClienteDetailResponseDto } from './dto/cliente-detail.response.dto';
import { CentroOperacionResponseDto } from './dto/centro-operacion.response.dto';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(ClienteEntity)
    private readonly clienteRepo: Repository<ClienteEntity>,
    private readonly notificacionesService: NotificacionesService,
  ) {}

  // ========================
  // CATÁLOGO DE EJECUTIVOS DE NEGOCIO
  // ========================
  async getEjecutivosNegocio(): Promise<
    { ejng_id: number; ejng_nombre: string }[]
  > {
    return this.clienteRepo.query(
      `SELECT ejng_id, ejng_nombre FROM Ejecutivo_negocio ORDER BY ejng_nombre`,
    );
  }

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
        c.pai_id AS [pai_id],
        c.dpto_id AS [dpto_id],
        c.ciu_id AS [ciu_id],
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
      pai_id: cliente.pai_id,
      dpto_id: cliente.dpto_id,
      ciu_id: cliente.ciu_id,
      ejng_id: cliente.ejng_id,
      ejecutivo: cliente.ejng_nombre ? { nombre: cliente.ejng_nombre } : null,
      centro_operacion_ids,
    };
  }

  // ========================
  // SOLO CLIENTES YA APROBADOS (con al menos una solicitud en sol_estado_id
  // = 5/APROBADA según la tabla real `solicitud_estados` — ver
  // BACKEND/FLUJO_ETAPAS.md; ojo, NO es el mismo id que
  // FRONTEND/src/constants/estado-solicitud.ts, que tiene APROBADA=4 y no
  // coincide con este catálogo) — para selectores donde no aplica cualquier
  // registro de Clientes, como el de "Ampliación de Cupo" (ver
  // documentacion/plan-archivo-maestro-documentos-cliente-y-soportes-analisis.md)
  // ========================
  async findAllAprobados(): Promise<ClienteListResponseDto[]> {
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
      WHERE EXISTS (
        SELECT 1 FROM dbo.solicitudes s
        WHERE s.sol_cliente_id = c.cli_id AND s.sol_estado_id = 5
      )
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
        co.cop_id AS [cop_id],
        co.cop_nombre AS [cop_nombre]
      FROM dbo.Detalle_cliente_centro dcc
      INNER JOIN dbo.Centro_operacion co ON co.cop_id = dcc.cop_id
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
    const habilitaAcceso = dto.cli_acceso_portal_clientes ?? false;
    // El login de clientes compara la contraseña en texto plano
    // (auth.service.ts), así que se genera y se guarda igual.
    const passwordGenerada = habilitaAcceso
      ? Math.random().toString(36).slice(-8)
      : null;

    const entity = plainToInstance(ClienteEntity, {
      cli_razon_social: dto.cli_razon_social,
      cli_nro_identificacion: dto.cli_nro_identificacion,
      cli_tipo_identificacion: dto.cli_tipo_identificacion,
      cli_direccion: dto.cli_direccion,
      cli_correo: dto.cli_correo,
      cli_acceso_portal_clientes: habilitaAcceso,
      cli_password: passwordGenerada,
      ejng_id: dto.ejng_id,
      cli_estado: 'A',
      pai_id: dto.pai_id,
      dpto_id: dto.dpto_id,
      ciu_id: dto.ciu_id,
      // Columnas obligatorias sin default en la BD, sin captura en el
      // formulario todavía: valores genéricos.
      cli_porcentaje_entrega: 0,
      cli_tonelada_objetivo: 0,
      cli_estado_aprobacion: 'P',
      cli_fecha_usr: new Date(),
    });

    const saved = await this.clienteRepo.save(entity);

    // Insertar centros operación
    if (dto.centro_operacion_ids && Array.isArray(dto.centro_operacion_ids)) {
      for (const copId of dto.centro_operacion_ids) {
        await this.clienteRepo.query(
          `INSERT INTO dbo.Detalle_cliente_centro (cli_id, cop_id, dclc_estado, dclc_fecha_usr)
           VALUES (@0, @1, 'A', GETDATE())`,
          [saved.cli_id, copId],
        );
      }
    }

    if (habilitaAcceso && dto.cli_correo && passwordGenerada) {
      // No debe bloquear la creación del cliente si el correo falla.
      this.notificacionesService
        .notificarCredencialesUsuario({
          nombre: dto.cli_razon_social,
          usuario_login: dto.cli_nro_identificacion,
          usuario_email: dto.cli_correo,
          usuario_password: passwordGenerada,
          portal_url: process.env.PORTAL_CLIENTES_URL || '',
        })
        .catch((error) =>
          console.error(
            '[ClientesService] Error enviando correo de credenciales:',
            error,
          ),
        );
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

    const actual = await this.clienteRepo.findOne({ where: { cli_id } });
    const habilitandoAccesoAhora =
      dto.cli_acceso_portal_clientes === true &&
      !actual?.cli_acceso_portal_clientes;
    const correoDestino = dto.cli_correo ?? actual?.cli_correo ?? undefined;

    let passwordGenerada: string | null = null;
    if (habilitandoAccesoAhora && correoDestino) {
      // Se genera solo si no tenía acceso antes; si ya lo tenía, se
      // conserva la contraseña existente en vez de invalidarla.
      passwordGenerada = Math.random().toString(36).slice(-8);
    }

    const updateEntity = plainToInstance(
      ClienteEntity,
      passwordGenerada
        ? { ...updateData, cli_password: passwordGenerada }
        : updateData,
      { excludeExtraneousValues: false },
    );

    await this.clienteRepo.update(cli_id, updateEntity);

    if (centro_operacion_ids && Array.isArray(centro_operacion_ids)) {
      await this.clienteRepo.query(
        'DELETE FROM dbo.Detalle_cliente_centro WHERE cli_id = @0',
        [cli_id],
      );

      for (const copId of centro_operacion_ids) {
        await this.clienteRepo.query(
          `INSERT INTO dbo.Detalle_cliente_centro (cli_id, cop_id, dclc_estado, dclc_fecha_usr)
           VALUES (@0, @1, 'A', GETDATE())`,
          [cli_id, copId],
        );
      }
    }

    if (passwordGenerada && correoDestino) {
      const nombre = dto.cli_razon_social ?? actual?.cli_razon_social ?? '';
      this.notificacionesService
        .notificarCredencialesUsuario({
          nombre,
          usuario_login:
            dto.cli_nro_identificacion ?? actual?.cli_nro_identificacion ?? '',
          usuario_email: correoDestino,
          usuario_password: passwordGenerada,
          portal_url: process.env.PORTAL_CLIENTES_URL || '',
        })
        .catch((error) =>
          console.error(
            '[ClientesService] Error enviando correo de credenciales:',
            error,
          ),
        );
    }

    return this.findOne(cli_id);
  }

  // ========================
  // CAMBIAR CONTRASEÑA (autoservicio del propio cliente)
  // ========================
  async changePasswordCliente(
    cli_id: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const cliente = await this.clienteRepo.findOne({ where: { cli_id } });
    if (!cliente) {
      throw new NotFoundException('Cliente no existe');
    }

    // El login de clientes compara la contraseña en texto plano
    // (auth.service.ts), asi que se guarda igual aqui.
    if (cliente.cli_password !== currentPassword) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    await this.clienteRepo.update(cli_id, { cli_password: newPassword });
    return { message: 'Contraseña actualizada correctamente' };
  }
}
