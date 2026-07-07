import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request } from 'express';

@Catch()
export class LogExceptionsFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const status = (exception as any)?.getStatus?.() ?? 500;
    const response = (exception as any)?.getResponse?.();

    console.error(
      `\n🔴 [ERROR] ${req.method} ${req.originalUrl}\n` +
        `🔴 [ERROR] Body recibido: ${JSON.stringify(req.body)}\n` +
        `🔴 [ERROR] Status: ${status}\n` +
        `🔴 [ERROR] Detalle: ${JSON.stringify(response ?? (exception as any)?.message)}`,
    );

    super.catch(exception, host);
  }
}
