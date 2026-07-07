import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuarioRolEntity } from './entities/usuario-rol.entity';
import { UsuarioEntity } from '../usuarios/entities/usuario.entity';
import { RolEntity } from '../roles/entities/rol.entity';
import { UsuarioRolesService } from './usuario-roles.service';
import { UsuarioRolesController } from './usuario-roles.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsuarioRolEntity, UsuarioEntity, RolEntity]),
    AuthModule,
  ],
  providers: [UsuarioRolesService],
  controllers: [UsuarioRolesController],
  exports: [UsuarioRolesService],
})
export class UsuarioRolesModule {}
