import { SolicitudesWorkflowService } from './solicitudes-workflow.service';

describe('SolicitudesWorkflowService.reiniciarEdicionSolicitud', () => {
  it('reinicia el flujo para que el cliente vuelva a firmar documentos', async () => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      query: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };

    const historialWorkflowService = {
      registrarTransicionConSLA: jest.fn(),
    };

    const workflowService = {
      obtenerEtapaPorCodigo: jest.fn().mockResolvedValue({ wet_id: 2 }),
      obtenerResultadoPorCodigo: jest.fn().mockResolvedValue({ wee_id: 1 }),
    };

    const dataSource = {
      createQueryRunner: () => queryRunner,
      query: jest.fn(),
    };

    const service = new SolicitudesWorkflowService(
      dataSource as any,
      {} as any,
      {} as any,
      workflowService as any,
      historialWorkflowService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    queryRunner.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT sol_ses_id, sol_wet_id, sol_wee_id')) {
        return [{ sol_ses_id: 2, sol_wet_id: 2, sol_wee_id: 1 }];
      }
      if (sql.includes("WHERE wet_codigo = 'CLI'")) {
        return [{ wet_id: 1 }];
      }
      if (sql.includes("WHERE wee_codigo = 'PENDIENTE'")) {
        return [{ wee_id: 1 }];
      }
      if (sql.includes("WHERE wee_codigo = 'PEND_FIRMA'")) {
        return [{ wee_id: 5 }];
      }
      return [];
    });

    const result = await service.reiniciarEdicionSolicitud(99, 7);

    expect(result.reinicio).toBe(true);
    expect(result.etapaId).toBe(1);
    expect(result.resultadoId).toBe(5);
    expect(
      historialWorkflowService.registrarTransicionConSLA,
    ).toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE solicitudes'),
      expect.any(Array),
    );
  });
});
