import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipoVigencia } from './entities/tipo-vigencia.entity';
import { TiposVigenciaService } from './tipos-vigencia.service';
import { TiposVigenciaController } from './tipos-vigencia.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TipoVigencia])],
  controllers: [TiposVigenciaController],
  providers: [TiposVigenciaService],
  exports: [TiposVigenciaService],
})
export class TiposVigenciaModule {}
