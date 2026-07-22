import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoDocumentoRevision } from './entities/tipo-documento-revision.entity';
import { CreateTipoDocumentoRevisionDto } from './dto/create-tipo-documento-revision.dto';
import { UpdateTipoDocumentoRevisionDto } from './dto/update-tipo-documento-revision.dto';

@Injectable()
export class RevisionesDocumentosService {
  constructor(
    @InjectRepository(TipoDocumentoRevision)
    private readonly repo: Repository<TipoDocumentoRevision>,
  ) {}

  create(dto: CreateTipoDocumentoRevisionDto) {
    return this.repo.save({ ...dto, estado: dto.estado ?? true });
  }

  findByTipoDocumento(tipoDocumentoId: number) {
    return this.repo.find({
      where: { tipoDocumentoId, estado: true },
      order: { orden: 'ASC', fecha: 'ASC', tdrId: 'ASC' },
    });
  }

  update(tdrId: number, dto: UpdateTipoDocumentoRevisionDto) {
    return this.repo.update(tdrId, dto);
  }

  remove(tdrId: number) {
    return this.repo.update(tdrId, { estado: false });
  }
}
