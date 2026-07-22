import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClienteEntity]), AuthModule],
  controllers: [CarteraController],
  providers: [CarteraService],
})
export class CarteraModule {}
