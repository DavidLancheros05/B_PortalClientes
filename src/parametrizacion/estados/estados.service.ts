import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class EstadosService {
  constructor(private readonly dataSource: DataSource) {}

  async getEstados() {
    const result = await this.dataSource.query(`
      SELECT estado_id, codigo, descripcion, orden
      FROM estados
      ORDER BY orden, estado_id
    `);
    return result;
  }

  async crearEstado(data: {
    codigo: string;
    descripcion: string;
    orden: number;
  }) {
    const { codigo, descripcion, orden } = data;

    if (!codigo || !descripcion || orden === undefined || orden === null) {
      throw new Error('codigo, descripcion y orden son requeridos');
    }

    const result = await this.dataSource.query(
      `
        INSERT INTO estados (codigo, descripcion, orden)
        VALUES (@0, @1, @2);
        SELECT SCOPE_IDENTITY() AS estado_id;
      `,
      [codigo, descripcion, Number(orden)],
    );

    const estadoId = result[0]?.estado_id;
    const created = await this.dataSource.query(
      `SELECT estado_id, codigo, descripcion, orden FROM estados WHERE estado_id = @0`,
      [estadoId],
    );

    return created[0];
  }

  async actualizarEstado(
    estadoId: number,
    data: { codigo: string; descripcion: string; orden: number },
  ) {
    const { codigo, descripcion, orden } = data;

    if (!estadoId || !codigo || !descripcion || orden === undefined) {
      throw new Error('estadoId, codigo, descripcion y orden son requeridos');
    }

    await this.dataSource.query(
      `
        UPDATE estados
        SET codigo = @0,
            descripcion = @1,
            orden = @2
        WHERE estado_id = @3
      `,
      [codigo, descripcion, Number(orden), estadoId],
    );

    const updated = await this.dataSource.query(
      `SELECT estado_id, codigo, descripcion, orden FROM estados WHERE estado_id = @0`,
      [estadoId],
    );

    return updated[0];
  }

  async eliminarEstado(estadoId: number) {
    if (!estadoId) {
      throw new Error('estadoId es requerido');
    }

    await this.dataSource.query(`DELETE FROM estados WHERE estado_id = @0`, [
      estadoId,
    ]);

    return { message: 'Estado eliminado' };
  }
}
