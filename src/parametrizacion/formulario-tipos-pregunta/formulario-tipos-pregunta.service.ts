import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

export interface TipoPregunta {
  fti_id: number;
  fti_codigo: string;
  fti_descripcion: string;
  fti_estado: boolean;
}

@Injectable()
export class FormularioTiposPreguntaService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async listar(includeInactivos: boolean = false): Promise<TipoPregunta[]> {
    let query = `
      SELECT
        fti_id,
        fti_codigo,
        fti_descripcion,
        fti_estado
      FROM Formulario_tipo_input
    `;

    if (!includeInactivos) {
      query += ` WHERE fti_estado = 1`;
    }

    query += ` ORDER BY fti_codigo ASC`;

    const result = await this.dataSource.query(query);
    return result;
  }
}
