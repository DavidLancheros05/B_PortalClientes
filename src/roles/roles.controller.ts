import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  async findAll() {
    return await this.rolesService.findAll();
  }

  @Get(':rolId')
  async findById(@Param('rolId', ParseIntPipe) rolId: number) {
    return await this.rolesService.findById(rolId);
  }
}
