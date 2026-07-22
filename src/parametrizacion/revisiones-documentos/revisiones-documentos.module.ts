import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipoDocumentoRevision } from './entities/tipo-documento-revision.entity';
import { RevisionesDocumentosService } from './revisiones-documentos.service';

@Module({
  imports: [TypeOrmModule.forFeature([TipoDocumentoRevision])],
  providers: [RevisionesDocumentosService],
  exports: [RevisionesDocumentosService],
})
export class RevisionesDocumentosModule {}
