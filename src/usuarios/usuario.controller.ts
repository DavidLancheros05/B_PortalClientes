// backend/src/users/users.controller.ts
import {
  Controller,
  Patch,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  Get,
  Post,
  Param,
  Delete,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequierePermiso } from '../permissions/requiere-permiso.decorator';
import { UsuarioService } from './usuario.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { usr_id: number; tipo?: 'cliente' | 'usuario'; rol?: string };
}

@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsuarioController {
  constructor(private readonly usersService: UsuarioService) {}

  @Get()
  @RequierePermiso('/seguridad/usuarios', 'ver')
  async findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @RequierePermiso('/seguridad/usuarios', 'crear')
  async create(
    @Body()
    body: {
      nombre: string;
      usuario_login: string;
      usuario_email: string;
      usuario_password: string;
      usuario_rol_id: number;
      ejng_id?: number;
      cliente_id?: number;
    },
    @Req() req: AuthRequest,
  ) {
    try {
      if (
        !body.nombre ||
        !body.usuario_login ||
        !body.usuario_password ||
        !body.usuario_rol_id
      ) {
        throw new HttpException(
          'Faltan campos requeridos',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (/\s/.test(body.usuario_login)) {
        throw new HttpException(
          'El usuario (login) no puede contener espacios',
          HttpStatus.BAD_REQUEST,
        );
      }
      return await this.usersService.createUser(
        {
          usr_nombre: body.nombre,
          usr_id_usuario: body.usuario_login,
          usr_correo: body.usuario_email,
          usuario_password: body.usuario_password,
          usuario_rol_id: body.usuario_rol_id,
          ejng_id: body.ejng_id,
        },
        req.user.usr_id,
      );
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error.message?.includes('ya está en uso')) {
        throw new HttpException(error.message, HttpStatus.CONFLICT);
      }
      throw new HttpException(
        error.message || 'Error al crear usuario',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('ejecutivos')
  async getEjecutivos() {
    return this.usersService.getEjecutivos();
  }

  @Patch('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthRequest,
  ) {
    // Antes leía req.user.id, que no existe (lo agregaba JwtStrategy, que
    // nunca corrió), y el cambio siempre fallaba. Los clientes cambian su
    // contraseña por /clientes; su cli_id no es un usr_id.
    if (req.user.tipo === 'cliente' || req.user.rol === 'CLIENTE') {
      throw new BadRequestException(
        'Los clientes cambian su contraseña desde su perfil de cliente',
      );
    }
    try {
      await this.usersService.changePassword(
        req.user.usr_id,
        dto.currentPassword,
        dto.newPassword,
      );
    } catch (error: any) {
      throw new BadRequestException(
        error.message || 'No se pudo cambiar la contraseña',
      );
    }

    return { message: 'Contraseña actualizada correctamente' };
  }

  @Get(':usr_id')
  @RequierePermiso('/seguridad/usuarios', 'ver')
  async findOne(@Param('usr_id', ParseIntPipe) usr_id: number) {
    return this.usersService.findById(usr_id);
  }

  @Post(':usr_id')
  @RequierePermiso('/seguridad/usuarios', 'editar')
  async update(
    @Param('usr_id', ParseIntPipe) usr_id: number,
    @Body()
    body: {
      nombre: string;
      usuario_email: string;
      usuario_password?: string;
      usuario_rol_id: number;
      usuario_activo: boolean;
    },
    @Req() req: AuthRequest,
  ) {
    // Antes se pasaba `body` tal cual y el servicio lee usr_nombre/
    // usr_correo: editar nombre o correo nunca se guardaba.
    return this.usersService.updateUser(
      usr_id,
      {
        usr_nombre: body.nombre,
        usr_correo: body.usuario_email,
        usuario_password: body.usuario_password,
        usuario_activo: body.usuario_activo,
      },
      req.user.usr_id,
    );
  }

  @Delete(':usr_id')
  @RequierePermiso('/seguridad/usuarios', 'eliminar')
  async remove(@Param('usr_id', ParseIntPipe) usr_id: number) {
    return this.usersService.deleteUser(usr_id);
  }
}
