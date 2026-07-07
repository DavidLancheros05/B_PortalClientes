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
import { UsuarioService } from './usuario.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  AssignCentroDto,
  AssignMultipleCentrosDto,
  UpdateCentroDefaultDto,
} from './dto/assign-centro.dto';
import type { Request } from 'express';

interface AuthRequest extends Request {
  user: { id: number };
}

@UseGuards(JwtAuthGuard)
@Controller('usuarios')
export class UsuarioController {
  constructor(private readonly usersService: UsuarioService) {}

  @Get()
  async findAll() {
    return this.usersService.findAll();
  }

  @Post()
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
      return await this.usersService.createUser({
        usr_nombre: body.nombre,
        usr_usuario: body.usuario_login,
        usr_correo: body.usuario_email,
        usuario_password: body.usuario_password,
        usuario_rol_id: body.usuario_rol_id,
        ejng_id: body.ejng_id,
      });
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
    await this.usersService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );

    return { message: 'Contraseña actualizada correctamente' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentUser(@Req() req: AuthRequest) {
    return this.usersService.findById(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':userId/centros')
  async getUserCentros(@Param('userId', ParseIntPipe) userId: number) {
    return this.usersService.getUserCentros(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':userId/centros')
  async assignCentro(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignCentroDto,
  ) {
    return this.usersService.assignCentro(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':userId/centros/multiple')
  async assignMultipleCentros(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignMultipleCentrosDto,
  ) {
    return this.usersService.assignMultipleCentros(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':userId/centros/default')
  async setDefaultCentro(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateCentroDefaultDto,
  ) {
    return this.usersService.setDefaultCentro(userId, dto.co_id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':userId/centros/:centroId')
  async removeCentro(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('centroId', ParseIntPipe) centroId: number,
  ) {
    return this.usersService.removeCentro(userId, centroId);
  }

  @Get(':usr_id')
  async findOne(@Param('usr_id', ParseIntPipe) usr_id: number) {
    return this.usersService.findById(usr_id);
  }

  @Post(':usr_id')
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
  ) {
    return this.usersService.updateUser(usr_id, body);
  }

  @Delete(':usr_id')
  async remove(@Param('usr_id', ParseIntPipe) usr_id: number) {
    return this.usersService.deleteUser(usr_id);
  }
}
