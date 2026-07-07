import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CentroOperacionEntity } from './entities/centro-operacion.entity';

@Injectable()
export class CentrosOperacionService {
  constructor(
    @InjectRepository(CentroOperacionEntity)
    private readonly centroRepo: Repository<CentroOperacionEntity>,
  ) {}

  async findAll() {
    return this.centroRepo.find({
      where: { cop_estado: 'A' },
      order: { cop_nombre: 'ASC' },
    });
  }

  async findById(copId: number) {
    return this.centroRepo.findOne({
      where: { cop_id: copId },
    });
  }
}
