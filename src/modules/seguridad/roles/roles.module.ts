import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { RoleEntity } from './entities/role.entity';
import { RolModuloEntity } from './entities/rol-modulo.entity';
import { ModuloEntity } from 'src/modulos/entities/modulo.entity';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, RolModuloEntity, ModuloEntity]),
    AuthModule,
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
