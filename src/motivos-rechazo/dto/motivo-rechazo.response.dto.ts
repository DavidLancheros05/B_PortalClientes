export class MotivoRechazoResponseDto {
  id: number;
  descripcion: string;
  activo: boolean;

  constructor(id: number, descripcion: string, activo: boolean) {
    this.id = id;
    this.descripcion = descripcion;
    this.activo = activo;
  }

  static fromEntity(entity: any): MotivoRechazoResponseDto {
    return new MotivoRechazoResponseDto(
      entity.mrs_id,
      entity.mrs_descripcion,
      entity.mrs_activo,
    );
  }

  static fromEntities(
    entities: any[],
  ): MotivoRechazoResponseDto[] {
    return entities.map((entity) => this.fromEntity(entity));
  }
}
