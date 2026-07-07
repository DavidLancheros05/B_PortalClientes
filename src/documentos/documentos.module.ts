// src/documentos/documentos.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Documento } from './tipos-documetos/entities/documento.entity';
import { DocumentosService } from './documentos.service';
import { DocumentosController } from './documentos.controller';
import { TipoDocumento } from '../parametrizacion/tipos-documentos/entities/tipo-documento.entity';
import { SolicitudEntity } from '../solicitudes/entities/solicitud.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Documento, TipoDocumento, SolicitudEntity]),
  ],
  controllers: [DocumentosController],
  providers: [DocumentosService],
})
export class DocumentosModule {}
