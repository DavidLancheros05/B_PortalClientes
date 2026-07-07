import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignModuleDto } from './dto/assign-module.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('api/seguridad/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.rolesService.findOne(+id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(+id, updateRoleDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.rolesService.remove(+id);
  }

  @Get(':id/modulos')
  async getModulesByRole(@Param('id') id: string) {
    return this.rolesService.getModulesByRole(+id);
  }

  @Post(':rolId/modulos')
  async assignModuleToRole(
    @Param('rolId') rolId: string,
    @Body() assignModuleDto: AssignModuleDto,
  ) {
    return this.rolesService.assignModuleToRole(+rolId, assignModuleDto.modId, {
      ver: assignModuleDto.ver,
      crear: assignModuleDto.crear,
      editar: assignModuleDto.editar,
      eliminar: assignModuleDto.eliminar,
      aprobar: assignModuleDto.aprobar,
    });
  }

  @Delete(':rolId/modulos/:modId')
  async removeModuleFromRole(
    @Param('rolId') rolId: string,
    @Param('modId') modId: string,
  ) {
    await this.rolesService.removeModuleFromRole(+rolId, +modId);
    return { message: 'Módulo removido del rol correctamente' };
  }
}
