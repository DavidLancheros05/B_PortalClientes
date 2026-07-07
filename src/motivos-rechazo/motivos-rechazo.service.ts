import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MotivoRechazoEntity } from './entities/motivo-rechazo.entity';
import { CreateMotivoRechazoDto } from './dto/create-motivo-rechazo.dto';
import { MotivoRechazoResponseDto } from './dto/motivo-rechazo.response.dto';

@Injectable()
export class MotivosRechazoService {
  constructor(
    @InjectRepository(MotivoRechazoEntity)
    private readonly repo: Repository<MotivoRechazoEntity>,
  ) {}

  // 🔹 Listar todos (activos e inactivos)
  async findAll(): Promise<MotivoRechazoResponseDto[]> {
    const motivos = await this.repo.find({
      order: { mrs_descripcion: 'ASC' },
    });
    return MotivoRechazoResponseDto.fromEntities(motivos);
  }

  // 🔹 Listar solo activos
  async findActivos(): Promise<MotivoRechazoResponseDto[]> {
    const motivos = await this.repo.find({
      where: { mrs_activo: true },
      order: { mrs_descripcion: 'ASC' },
    });
    return MotivoRechazoResponseDto.fromEntities(motivos);
  }

  // 🔹 Crear motivo
  async create(dto: CreateMotivoRechazoDto): Promise<MotivoRechazoResponseDto> {
    const motivo = this.repo.create({
      mrs_descripcion: dto.descripcion,
      mrs_activo: true,
    });
    const saved = await this.repo.save(motivo);
    return MotivoRechazoResponseDto.fromEntity(saved);
  }

  // 🔹 Actualizar descripción
  async update(
    id: number,
    dto: CreateMotivoRechazoDto,
  ): Promise<MotivoRechazoResponseDto> {
    await this.repo.update(id, { mrs_descripcion: dto.descripcion });
    const motivo = await this.repo.findOneBy({ mrs_id: id });
    return MotivoRechazoResponseDto.fromEntity(motivo);
  }

  // 🔹 Toggle estado (activo/inactivo)
  async toggleActivo(
    id: number,
    mrs_activo: boolean,
  ): Promise<MotivoRechazoResponseDto> {
    await this.repo.update(id, { mrs_activo });
    const motivo = await this.repo.findOneBy({ mrs_id: id });
    return MotivoRechazoResponseDto.fromEntity(motivo);
  }

  // 🔹 Desactivar (soft delete simple)
  async desactivar(id: number) {
    await this.repo.update(id, { mrs_activo: false });
    return { message: 'Motivo desactivado' };
  }
}
