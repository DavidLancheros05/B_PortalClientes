import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipoDocumento } from './entities/tipo-documento.entity';
import { TiposDocumentosService } from './tipos-documentos.service';
import { TiposDocumentosController } from './tipos-documentos.controller';
import { TiposVigenciaModule } from '../tipos-vigencia/tipos-vigencia.module';

@Module({
  imports: [TypeOrmModule.forFeature([TipoDocumento]), TiposVigenciaModule],
  controllers: [TiposDocumentosController],
  providers: [TiposDocumentosService],
  exports: [TiposDocumentosService],
})
export class TiposDocumentosModule {}
