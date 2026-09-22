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

    super.catch(exception, host);
  }
}
