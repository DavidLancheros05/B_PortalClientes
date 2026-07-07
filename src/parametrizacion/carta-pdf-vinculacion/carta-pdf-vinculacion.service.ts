import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CartaPdfVinculacion } from './carta-pdf-vinculacion.entity';
import { CreateCartaPdfVinculacionDto } from './dto/create-carta-pdf-vinculacion.dto';

@Injectable()
export class CartaPdfVinculacionService {
  constructor(
    @InjectRepository(CartaPdfVinculacion)
    private repo: Repository<CartaPdfVinculacion>,
  ) {}

  findAll() {
    return this.repo.find({ order: { cpv_id: 'ASC' } });
  }

  findById(id: number) {
    return this.repo.findOne({ where: { cpv_id: id } });
  }

  create(dto: CreateCartaPdfVinculacionDto) {
    const nuevo = this.repo.create({
      cpv_nombre: dto.nombre,
      cpv_contenido: dto.contenido,
      cpv_activo: true,
    });

    return this.repo.save(nuevo);
  }

  update(id: number, data: Partial<CartaPdfVinculacion>) {
    return this.repo.update(id, data);
  }

  cambiarEstado(id: number, activo: boolean) {
    return this.repo.update(id, { cpv_activo: activo });
  }
}
