import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CondicionFinanciera } from './condicion-financiera.entity';
import { CondicionesFinancierasService } from './condiciones-financieras.service';
import { CondicionesFinancierasController } from './condiciones-financieras.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([CondicionFinanciera]), AuthModule],
  providers: [CondicionesFinancierasService],
  controllers: [CondicionesFinancierasController],
  exports: [CondicionesFinancierasService],
})
export class CondicionesFinancierasModule {}
