export class AssignCentroDto {
  co_id: number;
  es_default?: boolean;
}

export class AssignMultipleCentrosDto {
  centros: AssignCentroDto[];
}

export class UpdateCentroDefaultDto {
  co_id: number;
}
