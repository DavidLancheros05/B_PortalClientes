import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClienteEntity } from '../clientes/entities/clientes.entity';
import { AuthModule } from '../auth/auth.module';
import { AccesoClienteService } from '../common/acceso/acceso-cliente.service';
import { FacturasController } from './facturas.controller';
import { FacturasService } from './facturas.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClienteEntity]), AuthModule],
  controllers: [FacturasController],
  providers: [FacturasService, AccesoClienteService],
})
export class FacturasModule {}
